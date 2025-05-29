import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' })); // Para aceptar Base64 grandes

// Carpetas para guardar datos
const REPORTS_DIR = path.join(process.cwd(), 'reports');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

app.use('/uploads', express.static(UPLOADS_DIR));

async function ensureDirs() {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

// Función para guardar imagen Base64 en disco
async function saveBase64Image(base64String, prefix = 'img') {
    const matches = base64String.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid base64 string format');

    const mimeType = matches[1]; // ej. image/png
    const extension = mimeType.split('/')[1]; // png, jpeg, etc.
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const filename = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await fs.writeFile(filepath, buffer);
    return `/uploads/${filename}`; //  Devolver la URL relativa a la carpeta pública
}

app.post('/reports', async (req, res) => {
    try {
        const {
            ownerName,
            phoneNumber,
            licensePlate,
            faultDescription,
            location,
            photos,
            ownerSignature,
            technicianSignature,
        } = req.body;

        // Validaciones básicas
        if (!ownerName || ownerName.length < 2) throw new Error('ownerName inválido');
        if (!phoneNumber) throw new Error('phoneNumber requerido');
        if (!licensePlate || licensePlate.length < 3) throw new Error('licensePlate inválido');
        if (!faultDescription || faultDescription.length < 10) throw new Error('faultDescription inválido');
        if (!ownerSignature) throw new Error('ownerSignature requerida');
        if (!technicianSignature) throw new Error('technicianSignature requerida');

        // Crear carpetas si no existen
        await ensureDirs();

        // Guardar fotos (pueden ser 0 o más)
        const photoFiles = [];
        if (Array.isArray(photos)) {
            for (const photoBase64 of photos) {
                const file = await saveBase64Image(photoBase64, 'photo');
                photoFiles.push(file);
            }
        }

        // Guardar firmas
        const ownerSignFile = await saveBase64Image(ownerSignature, 'ownerSign');
        const technicianSignFile = await saveBase64Image(technicianSignature, 'techSign');

        // Generar ID único para reporte
        const reportId = uuidv4();

        // Construir objeto reporte
        const reportData = {
            id: reportId,
            ownerName,
            phoneNumber,
            licensePlate,
            faultDescription,
            location: location || null,
            photos: photoFiles,
            ownerSignature: ownerSignFile,
            technicianSignature: technicianSignFile,
            createdAt: new Date().toISOString(),
            status: 'pending',
        };

        // Guardar reporte en archivo JSON
        const reportPath = path.join(REPORTS_DIR, `${reportId}.json`);
        await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));

        res.status(201).json({ reportId });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/reports', async (req, res) => {
    try {
        const files = await fs.readdir(REPORTS_DIR);
        const reports = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(REPORTS_DIR, file), 'utf-8');
                const report = JSON.parse(content);

                // Asegurar que cada reporte tenga un campo `status`
                if (!report.status) report.status = 'pending';

                reports.push(report);
            }
        }


        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Error reading reports' });
    }
});

app.put('/reports/:id/status', async (req, res) => {
    try {
        const reportId = req.params.id;
        const { status } = req.body;

        if (!['pending', 'attended'].includes(status)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }

        const reportPath = path.join(REPORTS_DIR, `${reportId}.json`);

        // Verifica que el archivo exista
        try {
            await fs.access(reportPath);
        } catch {
            return res.status(404).json({ error: 'Reporte no encontrado' });
        }

        const content = await fs.readFile(reportPath, 'utf-8');
        const reportData = JSON.parse(content);

        // Actualizar el estado
        reportData.status = status;

        // Guardar los cambios
        await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));

        res.json(reportData);
    } catch (error) {
        res.status(500).json({ error: 'Error actualizando el estado del reporte' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend corriendo en http://localhost:${PORT}`);
});

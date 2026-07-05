const AdmZip = require('adm-zip');
const fetch = require('node-fetch');

// URL do release no GitHub (troca pelo seu)
const ZIP_URL = 'https://github.com/SEU_USER/SEU_REPO/releases/download/v1.0/69ms_V2_SRC.zip';

let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getDumpData() {
    const now = Date.now();
    if (cachedData && (now - cacheTime) < CACHE_TTL) {
        return cachedData;
    }

    const response = await fetch(ZIP_URL);
    if (!response.ok) throw new Error('Failed to download zip');

    const buffer = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(buffer);

    const result = {
        files: [],
        classes: [],
        offsets: {},
        rawText: []
    };

    const entries = zip.getEntries();

    for (const entry of entries) {
        if (entry.isDirectory) continue;

        const name = entry.entryName.toLowerCase();
        const content = entry.getData().toString('utf-8');

        result.files.push(entry.entryName);

        // Tenta detectar tipo de arquivo
        if (name.includes('offset') || name.includes('dump')) {
            const lines = content.split('\n');
            for (const line of lines) {
                const match = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(0x[0-9A-Fa-f]+|\d+)/);
                if (match) {
                    result.offsets[match[1]] = match[2];
                }
            }
            result.rawText.push({ file: entry.entryName, type: 'offsets', preview: content.slice(0, 2000) });
        }
        else if (name.includes('class') || name.endsWith('.cs') || name.endsWith('.h')) {
            const classMatches = content.match(/class\s+(\w+)/g);
            if (classMatches) {
                classMatches.forEach(m => {
                    const className = m.replace('class ', '').trim();
                    if (!result.classes.includes(className)) result.classes.push(className);
                });
            }
            result.rawText.push({ file: entry.entryName, type: 'classes', preview: content.slice(0, 2000) });
        }
        else {
            result.rawText.push({ file: entry.entryName, type: 'unknown', preview: content.slice(0, 1000) });
        }
    }

    cachedData = result;
    cacheTime = now;
    return result;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        const { game, search, type } = req.query;
        const data = await getDumpData();

        let response = { ...data };

        // Filtros
        if (search) {
            const term = search.toLowerCase();
            response.rawText = data.rawText.filter(f => 
                f.file.toLowerCase().includes(term) || 
                f.preview.toLowerCase().includes(term)
            );
        }

        if (type) {
            response.rawText = response.rawText.filter(f => f.type === type);
        }

        if (game) {
            response.game = game;
        }

        res.status(200).json(response);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

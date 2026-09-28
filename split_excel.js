const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const inputFile = 'Setembro_v19-CORRETA.xlsm';
const outputDir = 'planilha setembro';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

console.log('Lendo arquivo: ' + inputFile);
try {
    const workbook = xlsx.readFile(inputFile, { cellFormula: false, cellHTML: false, cellText: false });
    console.log('Arquivo lido. Encontradas ' + workbook.SheetNames.length + ' abas.');

    workbook.SheetNames.forEach(sheetName => {
        console.log('Extraindo aba: ' + sheetName);
        const newWorkbook = xlsx.utils.book_new();
        const worksheet = workbook.Sheets[sheetName];
        xlsx.utils.book_append_sheet(newWorkbook, worksheet, sheetName);
        
        // Remove special characters from filename
        const safeSheetName = sheetName.replace(/[<>:"/\\|?*]+/g, '_');
        const outputFile = path.join(outputDir, safeSheetName + '.xlsx');
        
        xlsx.writeFile(newWorkbook, outputFile);
        console.log('Salvo: ' + outputFile);
    });

    console.log('Extração concluída com sucesso!');
} catch (error) {
    console.error('Erro ao processar arquivo:', error);
}

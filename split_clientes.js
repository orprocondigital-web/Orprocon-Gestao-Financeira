const xlsx = require('xlsx');
const path = require('path');

const inputFile = 'planilha setembro/Clientes.xlsx';
const outputDir = 'planilha setembro';

console.log('Lendo ' + inputFile + '...');
const wb = xlsx.readFile(inputFile);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

// Le as linhas
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
console.log('Total de linhas encontradas: ' + rows.length);

const header = rows[0];
const dataRows = rows.slice(1);
const half = Math.ceil(dataRows.length / 2);

const part1 = [header].concat(dataRows.slice(0, half));
const part2 = [header].concat(dataRows.slice(half));

function savePart(data, filename) {
    const newWb = xlsx.utils.book_new();
    const newWs = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(newWb, newWs, sheetName);
    xlsx.writeFile(newWb, filename);
    console.log('Salvo: ' + filename + ' com ' + data.length + ' linhas.');
}

savePart(part1, path.join(outputDir, 'Clientes_Parte1.xlsx'));
savePart(part2, path.join(outputDir, 'Clientes_Parte2.xlsx'));

console.log('Divisão concluída com sucesso!');

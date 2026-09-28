const XLSX = require('xlsx');
const fs = require('fs');
const exec = require('child_process').exec;

console.log("Lendo arquivo original (pode demorar alguns segundos)...");
const wb = XLSX.readFile('Agosto_LANÇAMENTOS_v18_CORRIGIDO.xlsm', { cellStyles: false, cellNF: false });

const sheetNamesToExtract = [
  "Sicredi 19915-0 Conta 627", "Sicredi 26208-6-0 Conta 7573", "Sicredi 26182-7-0 Conta 7575", "Sicredi 26135-7-0 Conta 7574",
  "Banrisul 13953.0-6-0 Conta 637", "Banrisul 13953.0-6-0 Conta 783", "CAIXA 000577219519-7 Conta 3112", "CAIXA 000577219469-7 Conta 2832",
  "SICOOB  58.289-1 Conta 7486", "SICOOB 24432-0 Conta 643", "SICOOB 58.282-4 Conta 7483", "SICOOB  58.287-5 Conta 7485", "SICOOB 58.286-7 Conta 7484",
  "SANTANDER 13007400-1 Conta 7836", "SANTANDER 13007403-2 Conta 7835",
  "Matriz", "Tubarão", "Florianopolis", "Passo Fundo", "Criciuma", "Chapecó",
  "pagamentos em dinheiro", "juros recebidos", "digitação compras"
];

if (!fs.existsSync('Abas_Separadas')) fs.mkdirSync('Abas_Separadas');

sheetNamesToExtract.forEach(name => {
  const found = wb.SheetNames.find(sn => sn.toLowerCase().trim() === name.toLowerCase().trim());
  if (found) {
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, wb.Sheets[found], found);
    const safeName = found.replace(/[<>:"/\\|?*]/g, '_');
    XLSX.writeFile(newWb, `Abas_Separadas/${safeName}.xlsx`);
    console.log(`Extraiu: ${found}`);
  }
});

console.log("Feito! As abas foram extraídas para a pasta Abas_Separadas.");

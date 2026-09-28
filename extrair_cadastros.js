const XLSX = require('xlsx');
console.log("Lendo arquivo original (pode demorar alguns segundos)...");
const wb = XLSX.readFile('Agosto_LANÇAMENTOS_v18_CORRIGIDO.xlsm', { cellStyles: false, cellNF: false });

function extractSheetMatch(keyword, outName) {
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes(keyword.toLowerCase()));
  if (sheetName) {
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, wb.Sheets[sheetName], keyword);
    XLSX.writeFile(newWb, outName);
    console.log(`Extraiu aba "${sheetName}" para o arquivo ${outName}`);
  } else {
    console.log(`Aba contendo "${keyword}" não encontrada.`);
  }
}

extractSheetMatch('clientes', 'cadastro_clientes.xlsx');
extractSheetMatch('fornecedores', 'cadastro_fornecedores.xlsx');
extractSheetMatch('plano de contas', 'cadastro_plano_de_contas.xlsx');

# 📅 Painel de Vencimentos

Painel web para escritórios de contabilidade acompanharem, em uma única tela, tudo que vence nos clientes: **certificado digital A1**, **certidões negativas** (CND Federal, Estadual, Municipal e CRF FGTS), **alvarás**, **procurações** e **licenças**.

O painel mostra o que vence em **7, 15 e 30 dias**, destaca o que já venceu, registra as renovações e ajuda a avisar o cliente. Funciona direto no navegador, **sem servidor e sem instalação**.

---

## ✨ Funcionalidades

### Acompanhamento
- **Resumo por prazo:** cards com vencidos, até 7 dias, 8 a 15, 16 a 30 e em dia. Clicar em um card filtra a lista.
- **Faixa de situação geral:** fica vermelha quando há documentos vencidos ou vencendo na semana.
- **Cinco abas:**

  | Aba | O que mostra |
  |---|---|
  | **Vencimentos** | Tabela com barra de prazo, status, andamento e ações. Ordena por coluna e tem paginação. |
  | **Por cliente** | Um card por cliente, colorido pelo documento mais crítico. |
  | **Clientes** | O cadastro completo. |
  | **Calendário** | Visão mensal com a agenda da semana ao lado. |
  | **Indicadores** | Gráficos de vencimentos por mês, por tipo e por responsável, e o andamento das renovações. |
- **Filtros:** busca por nome ou CNPJ/CPF, tipo, período, responsável e andamento.

### Cadastro e renovação
- **Clientes:** CNPJ/CPF com máscara e validação dos dígitos, regime, contato, e-mail e telefone.
- **Documentos:** número, emissão, vencimento, responsável, observações e **link do arquivo** (PDF no Drive, OneDrive etc.).
- **Validade padrão por tipo:** sugere o próximo vencimento a partir da emissão. É configurável.
- **Botão "Renovado":**
  - registra a nova data;
  - guarda o vencimento anterior no **histórico**;
  - volta o andamento para *Pendente*.
- **Andamento:** *Pendente*, *Em renovação* ou *Aguardando cliente*. Muda direto na tabela.
- **Ficha do cliente:** dados, documentos e linha do tempo com cadastros e renovações.
- **Desfazer:** excluir, renovar, importar, restaurar e limpar podem ser desfeitos pelo aviso que aparece na tela.

### Comunicação
- **Avisar cliente:** gera a mensagem pronta, com todos os documentos que pedem atenção. Envia pelo **WhatsApp** ou **e-mail**, ou copia o texto. O modelo é editável nas configurações.
- Ao enviar, os documentos podem ser marcados automaticamente como *Aguardando cliente*.
- **Notificação do navegador**, uma vez por dia, quando houver vencidos ou vencimentos na semana. É opcional.

### Relatórios e dados
- **Relatório em Excel** e **impressão/PDF**, respeitando os filtros e a ordenação.
- **Importar planilha** Excel ou CSV, com resumo antes de confirmar e um **modelo** para baixar.
- **Backup em JSON**, com dados e configurações.
- Salvamento automático no navegador.

### Extras
- **Tema claro e escuro.**
- **Modo TV:** tela cheia, com relógio, mostrando só o que vence em até 30 dias. Atualiza a cada minuto.
- **App instalável (PWA)** e funcionamento sem internet, quando publicado no GitHub Pages.
- **Atalhos:** `/` buscar · `N` novo documento · `C` novo cliente.
- **Layout responsivo:** funciona no computador e no celular.

---

## 🛠️ Tecnologias

- HTML, CSS e JavaScript puro, sem frameworks e sem etapa de build
- [Tailwind CSS](https://tailwindcss.com/) via CDN
- [SheetJS](https://sheetjs.com/) via CDN, para planilhas
- Fonte [Inter](https://fonts.google.com/specimen/Inter)

---

## 📁 Estrutura

```
painel-vencimentos/
├── index.html
├── manifest.webmanifest     # dados do app instalável
├── sw.js                    # funcionamento offline
├── css/
│   └── style.css            # temas e componentes
├── js/
│   ├── util.js              # datas, CNPJ/CPF, constantes, avisos
│   ├── dados.js             # armazenamento, backup, planilhas
│   ├── telas.js             # filtros e desenho das abas
│   ├── acoes.js             # formulários, renovação, mensagens, relatórios
│   └── app.js               # inicialização e eventos
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---

## 🚀 Como usar

**Pelo GitHub Pages (recomendado):** em *Settings → Pages*, escolha a branch `main` e acesse o link gerado. Assim o painel pode ser instalado como app e abre mesmo sem internet.

**No próprio computador:** abra o `index.html` no navegador. Funciona tudo, exceto a instalação como app e o modo offline.

Para testar, use **Dados → Carregar exemplos**.

> Na primeira vez é preciso estar conectado à internet, porque o Tailwind, o SheetJS e a fonte vêm de CDN.

---

## 📊 Importação de planilha

Baixe o modelo em **Dados → Baixar modelo de planilha**. Cada linha é um documento.

| Coluna        | Obrigatória | Observação                                       |
|---------------|-------------|--------------------------------------------------|
| Cliente       | Sim*        | Nome ou razão social                             |
| CNPJ/CPF      | Sim*        | Com ou sem pontuação                             |
| Tipo          | Sim         | Aceita variações: "certificado digital", "CRF FGTS", "certidão receita federal"... |
| Vencimento    | Sim         | `dd/mm/aaaa`, `aaaa-mm-dd` ou data do Excel      |
| Número, Emissão, Responsável, Observações, Link | Não | —                  |
| Regime, E-mail, Telefone, Contato | Não | Usados só ao criar um cliente novo       |

\* Informe pelo menos um dos dois. O cliente é localizado pelo CNPJ/CPF e, se não houver, pelo nome. Documentos repetidos (mesmo cliente, tipo e vencimento) são ignorados.

Dica: prefira `.xlsx`. Arquivos `.csv` salvos pelo Excel podem perder os acentos.

---

## 🚦 Regras de status

| Status        | Condição                   |
|---------------|----------------------------|
| Vencido       | Data de vencimento passou  |
| Até 7 dias    | Vence em 0 a 7 dias        |
| 8 a 15 dias   | Vence em 8 a 15 dias       |
| 16 a 30 dias  | Vence em 16 a 30 dias      |
| Em dia        | Vence em mais de 30 dias   |

O status de cada cliente é o do seu documento mais crítico.

### Validade padrão (sugestão de vencimento)

| Tipo | Dias | | Tipo | Dias |
|---|---|---|---|---|
| Certificado A1 | 365 | | CRF FGTS | 30 |
| CND Federal | 180 | | Alvará | 365 |
| CND Estadual | 90 | | Procuração | 365 |
| CND Municipal | 90 | | Licença | 365 |

Os prazos variam por estado e município. Ajuste em **Configurações** (ícone de engrenagem).

---

## ⚠️ Sobre os dados

Esta versão não tem servidor. Os dados ficam **apenas no navegador** em que foram cadastrados:
- cada computador e cada navegador tem seus próprios dados;
- limpar os dados de navegação apaga o painel.

Use **Dados → Exportar backup** com frequência. Para passar os dados a outra pessoa ou computador, use **Restaurar backup**.

---

## 🗺️ Próximos passos

- [x] Cadastro, importação de planilha e backup
- [x] Renovação com histórico, andamento e validade padrão
- [x] Mensagem para WhatsApp/e-mail e notificações
- [x] Relatórios, gráficos, calendário, filtros, ordenação e paginação
- [x] Modo TV, app instalável e atalhos
- [ ] Back-end com login, permissões e dados compartilhados pela equipe
- [ ] Alertas automáticos por e-mail, mesmo com o painel fechado
- [ ] Log de auditoria (quem alterou o quê)

---

## 📄 Licença

Distribuído sob a licença MIT.

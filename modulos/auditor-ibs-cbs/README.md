# Auditor IBS / CBS

Ferramenta de conferência de itens de NF-e (mod. 55) e NFS-e para validação de
CST, base de cálculo, alíquotas e valores de IBS/CBS conforme a LC 214/2025 e
a NT 2025.002 (grupo `IBSCBS`).

Página única (`index.html`), roda 100% no navegador — nenhum dado é enviado a
servidor nenhum. Todo o processamento de XML acontece localmente.

## Funcionalidades

- Upload (ou arrastar e soltar) de múltiplos XMLs de NF-e/NFS-e
- Inserção manual de itens vendidos, sem precisar do XML
- Conferência automática: CST, base de cálculo, alíquota nominal e efetiva
  (considerando reduções via `gRed`), valores de IBS (UF + Município) e CBS
- Sinalização de OK / Atenção / Erro por item, com o motivo explicado
- Referência rápida dos códigos oficiais de CST (Portal da Conformidade Fácil
  — SVRS)
- Calculadora manual avulsa (BC × alíquota) para conferir um item isolado
- Exportação em CSV, pronta para abrir no Excel (acentuação e formato pt-BR)

## Publicar no GitHub Pages

1. **Crie o repositório no GitHub**
   - Acesse [github.com/new](https://github.com/new)
   - Nome sugerido: `auditor-ibs-cbs`
   - Pode deixar como **público**
   - Não marque "Add a README" (este já vem pronto)

2. **Suba os arquivos**

   No seu computador, dentro da pasta com estes arquivos:

   ```bash
   git init
   git add .
   git commit -m "Primeira versão do Auditor IBS/CBS"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/auditor-ibs-cbs.git
   git push -u origin main
   ```

3. **Ative o GitHub Pages**
   - No repositório, vá em **Settings → Pages**
   - Em "Source", escolha **Deploy from a branch**
   - Branch: `main`, pasta: `/ (root)`
   - Salve — em alguns minutos a página estará em
     `https://SEU-USUARIO.github.io/auditor-ibs-cbs/`

Pronto — sem nenhuma dependência de backend ou serviço externo.

---

## Estrutura do repositório

```
.
├── index.html    → a ferramenta completa (frontend)
└── README.md
```

---

*Ferramenta de apoio à conferência fiscal — não substitui a validação oficial
nos ambientes da SEFAZ/Receita Federal nem a tabela vigente de
CST/cClassTrib publicada pelo Comitê Gestor do IBS.*

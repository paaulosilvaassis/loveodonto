# Logo do cabeçalho

## IMPORTANTE — Fundo preto/escuro na logo?

**Causa:** O arquivo PNG tem **fundo escuro embutido** (não transparente). O CSS está correto; o problema está no próprio arquivo.

**Solução:** Substitua `logo-header.png` por uma versão **com transparência real** (canal alpha).

---

## Como usar a logo correta

1. Use um PNG **com transparência** (sem fundo preto/escuro embutido).
2. Salve como: **`logo-header.png`**
3. Coloque na pasta **`public/`** do projeto (ao lado de `src/`).
4. Recarregue a aplicação.

- O wrapper usa fundo branco para destacar a logo.
- Altura: 40–44px (mobile: 34px).
- Proporção mantida automaticamente (`object-fit: contain`).
- Se o arquivo não existir, o sistema usa a logo antiga como fallback.

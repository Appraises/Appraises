# Contribution graph development

O gerador mantém a aparência do calendário de contribuições do GitHub e adiciona uma camada de grafo:

- todos os dias continuam visíveis como quadrados arredondados;
- somente dias com contribuição são vértices;
- uma aresta existe apenas entre vizinhos de cima, baixo, esquerda ou direita;
- componentes não triviais alternam entre DFS e BFS;
- a DFS mostra avanço e backtracking com um cursor contínuo;
- a BFS acende os níveis como ondas simultâneas;
- o preenchimento verde original nunca é substituído permanentemente.

## Prévia local

Requer Node.js 20 ou posterior e não possui dependências externas.

```bash
npm test
npm run generate:demo
```

Os dois temas são gravados em `dist/`:

- `github-contribution-graph.svg`
- `github-contribution-graph-dark.svg`

## Dados reais

O workflow consulta o `contributionCalendar` da API GraphQL usando o dono do repositório como login. Em seguida, publica somente os SVGs na branch `output`.

Para iniciar, abra **Actions → Generate contribution graph → Run workflow**. Depois disso, o `<picture>` do README selecionará automaticamente o tema claro ou escuro.

Por padrão, o token temporário do Actions lê as contribuições públicas. Para incluir o padrão de atividade privada, crie explicitamente um secret chamado `CONTRIBUTIONS_TOKEN` com um PAT classic limitado a `read:user`. Isso torna datas e volumes privados visíveis no SVG público, então deve ser uma escolha consciente.

## Arquivos principais

- `src/github.mjs`: consulta GraphQL e valida erros da API.
- `src/graph.mjs`: grade, arestas ortogonais, componentes, DFS e BFS.
- `src/timeline.mjs`: agenda conexão, exploração, backtracking e fade.
- `src/svg.mjs`: SVG declarativo com temas claro e escuro.
- `src/cli.mjs`: interface de geração por API, JSON ou demonstração.
- `test/`: invariantes dos algoritmos e do SVG.

O SVG não usa JavaScript, fontes externas ou `foreignObject`. As animações são CSS declarativo e respeitam `prefers-reduced-motion`.

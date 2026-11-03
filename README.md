# Ritmo

Gerenciador pessoal de tarefas desenvolvido para o Projeto Integrador Transdisciplinar em Engenharia de Software II.

O Ritmo permite cadastrar tarefas, marcá-las como concluídas ou reabri-las e excluí-las, por meio de uma página web servida pela própria aplicação. Os dados ficam em um banco SQLite local e são mantidos entre reinicializações.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Back-end | Node.js + [Fastify](https://fastify.dev) 5 |
| Persistência | SQLite, pelo módulo nativo `node:sqlite` do Node.js |
| Front-end | HTML, CSS e JavaScript puros, sem frameworks nem etapa de build |
| Testes | `node:test` (executor nativo do Node.js) e `fastify.inject()` |

A única dependência externa do projeto é o `fastify`.

## Requisitos para execução

- Node.js **22.13 ou superior** (necessário para o módulo `node:sqlite`)
- npm

## Instalação

```bash
git clone https://github.com/morexiety/ritmo.git
cd ritmo
npm install
```

## Execução

```bash
npm start
```

Acesse **http://127.0.0.1:3000** no navegador.

Para desenvolvimento, `npm run dev` reinicia o servidor automaticamente quando arquivos são alterados.

Variáveis de ambiente opcionais:

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `127.0.0.1` | Endereço de escuta (por padrão, apenas a máquina local) |
| `DB_PATH` | `data/ritmo.db` | Caminho do arquivo do banco SQLite |

O arquivo do banco e a pasta `data/` são criados automaticamente na primeira execução.

## Testes

```bash
npm test
```

Os testes usam um banco temporário isolado e não afetam `data/ritmo.db`.

## Estrutura

```
ritmo/
├── public/            front-end (index.html, styles.css, app.js)
├── src/
│   ├── server.js      configuração do Fastify e inicialização
│   ├── tasks.js       rotas da API de tarefas
│   └── database.js    conexão com o SQLite e aplicação do schema
├── sql/schema.sql     definição da tabela tasks
├── test/              testes automatizados
└── docs/              documentação técnica
```

## Documentação

- [Requisitos](docs/requisitos.md)
- [Casos de uso](docs/casos-de-uso.md)
- [Arquitetura e diagrama de classes](docs/arquitetura.md)
- [Modelo e dicionário de dados](docs/modelo-de-dados.md)
- [API REST](docs/api.md)

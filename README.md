# Ritmo

Gerenciador pessoal de tarefas desenvolvido para o Projeto Integrador Transdisciplinar em Engenharia de Software II.

O Ritmo permite cadastrar tarefas, marcá-las como concluídas ou reabri-las e excluí-las, por meio de uma página web servida pela própria aplicação. Cada pessoa cria sua conta (nome de usuário, e-mail e senha), entra com o nome de usuário ou o e-mail e vê somente as próprias tarefas. Os dados ficam em um banco SQLite local e são mantidos entre reinicializações.

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

Acesse **http://127.0.0.1:3000** no navegador. Sem sessão, a aplicação abre a página de login, que tem um link para criar uma conta.

Para desenvolvimento, `npm run dev` reinicia o servidor automaticamente quando arquivos são alterados.

Variáveis de ambiente opcionais:

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `127.0.0.1` | Endereço de escuta (por padrão, apenas a máquina local) |
| `DB_PATH` | `data/ritmo.db` | Caminho do arquivo do banco SQLite |
| `NODE_ENV` | — | Com `production`, o cookie de sessão recebe o atributo `Secure` e só é enviado por HTTPS |

O arquivo do banco e a pasta `data/` são criados automaticamente na primeira execução.

### Bancos criados antes da autenticação

Ao iniciar, a aplicação migra automaticamente o banco existente: acrescenta as tabelas de usuários e sessões e a coluna `tasks.user_id`. As tarefas antigas são preservadas, mas ficam sem dono e não aparecem para nenhuma conta. Para atribuí-las a uma conta, veja [Migração de bancos existentes](docs/modelo-de-dados.md#migração-de-bancos-existentes).

## Testes

```bash
npm test
```

Os testes usam um banco temporário isolado e não afetam `data/ritmo.db`.

## Estrutura

```
ritmo/
├── public/            front-end (index.html, login.html, register.html, styles.css, app.js, auth.js)
├── src/
│   ├── server.js      configuração do Fastify, páginas e inicialização
│   ├── auth.js        cadastro, login, sessões e proteção das rotas
│   ├── tasks.js       rotas da API de tarefas
│   └── database.js    conexão com o SQLite, migração e aplicação do schema
├── sql/schema.sql     definição das tabelas users, sessions e tasks
├── test/              testes automatizados
└── docs/              documentação técnica
```

## Documentação

- [Requisitos](docs/requisitos.md)
- [Casos de uso](docs/casos-de-uso.md)
- [Arquitetura e diagrama de classes](docs/arquitetura.md)
- [Modelo e dicionário de dados](docs/modelo-de-dados.md)
- [API REST](docs/api.md)

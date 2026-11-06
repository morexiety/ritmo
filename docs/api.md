# API REST

Base: `http://127.0.0.1:3000/api`. Requisições e respostas usam JSON.

## Autenticação

A API usa sessão por cookie. O cadastro e o login devolvem o cookie `ritmo_session`, que o navegador envia automaticamente nas requisições seguintes.

| Atributo do cookie | Valor |
|---|---|
| Conteúdo | Token aleatório de 32 bytes (base64url). O banco guarda apenas o SHA-256 do token. |
| `HttpOnly` | Sempre; o JavaScript da página não consegue ler o cookie. |
| `SameSite` | `Lax`; o cookie não é enviado em requisições `POST`/`PATCH`/`DELETE` vindas de outros sites. |
| `Secure` | Quando `NODE_ENV=production` (ou `buildServer({ secureCookies: true })`). |
| `Max-Age` | 604800 (7 dias). A expiração também é verificada no servidor. |

### Proteção contra CSRF

Cada sessão tem um token CSRF, devolvido no campo `csrfToken` do cadastro, do login e de `GET /api/auth/me`. Requisições autenticadas que alteram dados (`POST`, `PATCH`, `DELETE` em `/api/tasks` e `POST /api/auth/logout`) devem enviá-lo no cabeçalho `X-CSRF-Token`. Sem o token, ou com o token de outra sessão, a resposta é 403:

```json
{ "statusCode": 403, "error": "Forbidden", "message": "Invalid CSRF token" }
```

O cadastro e o login não exigem o token, mas aceitam apenas corpo `application/json`: corpos `text/plain` retornam 400 e formulários HTML (`application/x-www-form-urlencoded`), 415. Assim, um formulário de outro site não consegue enviá-los.

### Rotas protegidas

Todas as rotas de `/api/tasks`, `GET /api/auth/me` e `POST /api/auth/logout` exigem sessão válida. Sem cookie, com cookie inválido, expirado ou encerrado por logout, a resposta é 401:

```json
{ "statusCode": 401, "error": "Unauthorized", "message": "Authentication required" }
```

A autenticação é verificada antes da validação dos dados: uma requisição sem sessão recebe 401 mesmo que o corpo seja inválido.

## Recurso `User`

```json
{ "id": 1, "username": "Ana.Silva", "email": "ana@example.com" }
```

O hash da senha nunca é devolvido.

## `POST /api/auth/register` — criar conta

Corpo:

```json
{ "username": "Ana.Silva", "email": "Ana@Example.com", "password": "senha-segura" }
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `username` | Sim | 3 a 30 caracteres entre letras sem acento, números, `.`, `_` e `-` (portanto, sem `@` e sem espaços). Único, sem diferenciar maiúsculas de minúsculas. A grafia informada é mantida. |
| `email` | Sim | Formato `nome@dominio.ext`, até 254 caracteres. Único, sem diferenciar maiúsculas de minúsculas. Gravado em minúsculas. |
| `password` | Sim | 8 a 128 caracteres. |

Espaços nas pontas de `username` e `email` são removidos.

| Status | Quando | Corpo |
|---|---|---|
| `201 Created` | Conta criada; a sessão já é iniciada (`Set-Cookie`) | `{ "user": User, "csrfToken": "..." }` |
| `400 Bad Request` | Campo ausente ou fora das regras | Erro de validação |
| `409 Conflict` | Username já usado | `{ "statusCode": 409, "error": "Conflict", "message": "Username already taken" }` |
| `409 Conflict` | E-mail já cadastrado | `{ "statusCode": 409, "error": "Conflict", "message": "Email already registered" }` |

## `POST /api/auth/login` — entrar

Corpo:

```json
{ "identifier": "ana@example.com", "password": "senha-segura" }
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `identifier` | Sim | Username **ou** e-mail, sem diferenciar maiúsculas de minúsculas. Como o username não pode conter `@` e o e-mail sempre contém, cada valor identifica no máximo uma conta. |
| `password` | Sim | Senha da conta |

| Status | Quando | Corpo |
|---|---|---|
| `200 OK` | Credenciais corretas; nova sessão (`Set-Cookie`). Se a requisição trouxer uma sessão anterior, ela é encerrada. | `{ "user": User, "csrfToken": "..." }` |
| `400 Bad Request` | Campo ausente ou vazio | Erro de validação |
| `401 Unauthorized` | Conta inexistente **ou** senha incorreta | `{ "statusCode": 401, "error": "Unauthorized", "message": "Invalid credentials" }` |

A resposta 401 é idêntica nos dois casos, e o servidor calcula o scrypt mesmo quando a conta não existe, para que o tempo de resposta também não revele quais contas existem.

## `GET /api/auth/me` — usuário autenticado

| Status | Corpo |
|---|---|
| `200 OK` | `{ "user": User, "csrfToken": "..." }` |
| `401 Unauthorized` | Sem sessão válida |

## `POST /api/auth/logout` — sair

Exige o cabeçalho `X-CSRF-Token` e não tem corpo.

| Status | Quando |
|---|---|
| `204 No Content` | Sessão removida do banco; o cookie é apagado (`Max-Age=0`) |
| `401 Unauthorized` | Sem sessão válida |
| `403 Forbidden` | Token CSRF ausente ou incorreto |

---

## Rotas de tarefas

Base: `/api/tasks`. Todas as rotas exigem sessão válida e operam **somente sobre as tarefas do usuário autenticado**. Uma tarefa de outra conta (ou sem dono) é tratada como inexistente e retorna 404, sem revelar que existe.

## Recurso `Task`

```json
{
  "id": 1,
  "title": "Estudar Fastify",
  "completed": false,
  "created_at": "2026-11-03T21:59:39.856Z"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | número inteiro | Identificador gerado pelo banco |
| `title` | string | Título sem espaços nas pontas |
| `completed` | booleano | `true` quando concluída |
| `created_at` | string | Data de criação em UTC (ISO 8601) |

## Erros

Os erros seguem o formato padrão do Fastify. Em erros de validação (400), o campo `message` descreve o problema:

```json
{
  "statusCode": 400,
  "code": "FST_ERR_VALIDATION",
  "error": "Bad Request",
  "message": "body/title must match pattern \"\\S\""
}
```

Tarefa inexistente (404):

```json
{ "statusCode": 404, "error": "Not Found", "message": "Task not found" }
```

Os tipos não são convertidos automaticamente: `"true"` (string) ou `1` não são aceitos onde se espera um booleano. Um corpo que não seja JSON válido também retorna 400.

O parâmetro `:id` deve ser um inteiro positivo (`1`, `2`, ...). Valores como `abc`, `0`, `-1` ou `1.5` retornam 400.

---

## `POST /api/tasks` — criar tarefa

Corpo:

```json
{ "title": "  Estudar Fastify  " }
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `title` | Sim | String com ao menos um caractere que não seja espaço |

| Status | Quando | Corpo |
|---|---|---|
| `201 Created` | Tarefa criada | `Task`, com `completed: false` e o título sem espaços nas pontas |
| `400 Bad Request` | `title` ausente, vazio, só com espaços ou não string | Erro de validação |

## `GET /api/tasks` — listar tarefas

| Status | Corpo |
|---|---|
| `200 OK` | Array com as `Task` do usuário em ordem de criação (`id` crescente); `[]` quando não há tarefas |

## `PATCH /api/tasks/:id` — concluir ou reabrir

Corpo:

```json
{ "completed": true }
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `completed` | Sim | Booleano (`true` ou `false`) |

| Status | Quando | Corpo |
|---|---|---|
| `200 OK` | Tarefa atualizada | `Task` atualizada |
| `400 Bad Request` | `:id` inválido, ou `completed` ausente ou não booleano | Erro de validação |
| `404 Not Found` | Não existe tarefa com esse `id` do usuário autenticado | `Task not found` |

Apenas `completed` pode ser alterado. Outros campos enviados no corpo são ignorados.

## `DELETE /api/tasks/:id` — excluir tarefa

| Status | Quando | Corpo |
|---|---|---|
| `204 No Content` | Tarefa excluída | Vazio |
| `400 Bad Request` | `:id` inválido | Erro de validação |
| `404 Not Found` | Não existe tarefa com esse `id` do usuário autenticado | `Task not found` |

---

## Outras rotas do servidor

Não fazem parte da API, mas são servidas pela mesma aplicação:

| Rota | Resposta |
|---|---|
| `GET /` | Página de tarefas (`index.html`). Sem sessão válida, redireciona (302) para `/login`. |
| `GET /login` | Página de login. Com sessão válida, redireciona (302) para `/`. |
| `GET /register` | Página de cadastro. Com sessão válida, redireciona (302) para `/`. |
| `GET /styles.css`, `GET /app.js`, `GET /auth.js` | Arquivos estáticos do front-end |
| `GET /health` | `{"status":"ok"}` quando o servidor consegue consultar o banco |

## Exemplo com `curl`

O arquivo `cookies.txt` guarda o cookie de sessão entre os comandos.

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"username":"ana","email":"ana@example.com","password":"senha-segura"}' \
  http://127.0.0.1:3000/api/auth/register

CSRF=$(curl -s -b cookies.txt http://127.0.0.1:3000/api/auth/me | node -pe 'JSON.parse(require("fs").readFileSync(0)).csrfToken')

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"title":"Comprar pão"}' http://127.0.0.1:3000/api/tasks
curl -b cookies.txt http://127.0.0.1:3000/api/tasks
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -X PATCH -H 'Content-Type: application/json' -d '{"completed":true}' http://127.0.0.1:3000/api/tasks/1
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -X DELETE http://127.0.0.1:3000/api/tasks/1
curl -b cookies.txt -c cookies.txt -H "X-CSRF-Token: $CSRF" -X POST http://127.0.0.1:3000/api/auth/logout
```

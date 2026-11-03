# API REST

Base: `http://127.0.0.1:3000/api/tasks`. Requisições e respostas usam JSON. Não há autenticação.

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
| `200 OK` | Array de `Task` em ordem de criação (`id` crescente); `[]` quando não há tarefas |

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
| `404 Not Found` | Não existe tarefa com esse `id` | `Task not found` |

Apenas `completed` pode ser alterado. Outros campos enviados no corpo são ignorados.

## `DELETE /api/tasks/:id` — excluir tarefa

| Status | Quando | Corpo |
|---|---|---|
| `204 No Content` | Tarefa excluída | Vazio |
| `400 Bad Request` | `:id` inválido | Erro de validação |
| `404 Not Found` | Não existe tarefa com esse `id` | `Task not found` |

---

## Outras rotas do servidor

Não fazem parte da API de tarefas, mas são servidas pela mesma aplicação:

| Rota | Resposta |
|---|---|
| `GET /` | Página `index.html` |
| `GET /styles.css`, `GET /app.js` | Arquivos estáticos do front-end |
| `GET /health` | `{"status":"ok"}` quando o servidor consegue consultar o banco |

## Exemplo com `curl`

```bash
curl -X POST http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' -d '{"title":"Comprar pão"}'
curl http://127.0.0.1:3000/api/tasks
curl -X PATCH http://127.0.0.1:3000/api/tasks/1 -H 'Content-Type: application/json' -d '{"completed":true}'
curl -X DELETE http://127.0.0.1:3000/api/tasks/1
```

# Как подключить страницу ревью Syn3

Краткий чеклист: Discord-канал, бот, токены GitLab/GitHub.

## 1. Id канала Discord

Нужен **id текстового канала**, не id сервера.

1. Discord → User Settings → **Advanced** → включи **Developer Mode**.
2. ПКМ по каналу → **Copy Channel ID**.
3. Вставь это число в поле «Id канала Discord» в Syn3.

## 2. Бот Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → вкладка **Bot** → Add Bot.
2. **Reset Token** → скопируй токен (потом его не покажут).
3. Вкладка **Bot** → **Privileged Gateway Intents** → обязательно включи **Message Content Intent** и сохрани.
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Bot Permissions: View Channel, Read Message History, Send Messages, Create Public Threads, Send Messages in Threads, Attach Files
5. Открой сгенерированную ссылку и добавь бота на сервер.

### Message Content Intent (обязательно)

Без **Message Content Intent** Discord отдаёт сообщения **без текста**:

- в канале ты видишь, например, `MP-0` и ответы в ветке;
- на карте Syn3 — только автор (`@nick`) и подпись «нет текста».

Как включить:

1. Developer Portal → твоё приложение → **Bot**.
2. **Privileged Gateway Intents** → включи **Message Content Intent**.
3. Save Changes.
4. В Syn3 нажми **Повторить** на странице ревью (отдельный перезапуск бота не нужен — Syn3 ходит в REST API).

### Приватный канал

Invite на сервер недостаточно. В настройках канала → Permissions добавь роль/бота и явно разреши как минимум View Channel и Read Message History (плюс Send / Threads / Attach Files для постинга).

## 3. Токен GitLab или GitHub

На панели создания страницы выбери хост (**после** id канала).

### GitLab

Personal Access Token / Project Access Token с правом API (создание и чтение Merge Request).

### GitHub

[Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)

Рекомендуется **classic** с scope **`repo`**.

Fine-grained тоже можно: доступ к репозиторию + Pull requests Read/write + Contents Read/write.

## 4. Что пишется куда

| Данные | Где |
| --- | --- |
| channelId, provider, repoUrl, people | `.syn3/access.json` (можно коммитить) |
| токен GitLab / GitHub / Discord bot | секреты редактора VS Code / Cursor (не в репозиторий) |

Интервал автообновления страницы ревью задаётся в **Syn3 Settings** (по умолчанию 60 с, диапазон 30–3600).

## 5. Типичные ошибки

- **rate limited** — Discord временно ограничил запросы; подожди минуту и нажми Повторить.
- **Missing Access** — бот не видит канал (нет на сервере или нет прав на приватный канал).
- На карте автор/`(нет текста)`, а в Discord текст есть — не включён **Message Content Intent** (см. выше).
- Чипы со странным числовым id — то же: пустой текст от API; обнови расширение и включи Intent.

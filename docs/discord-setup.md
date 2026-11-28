# Как подключить Discord к Syn3

Нужны **id текстового канала** PROFILE_SYN3 и **токен бота**. Остальные каналы (проводник, заметки, ссылки, ревью) — по желанию.

## 1. Id канала Discord

Нужен **id текстового канала**, не id сервера.

1. Discord → User Settings → **Advanced** → включи **Developer Mode**.
2. ПКМ по каналу → **Copy Channel ID**.
3. Вставь число в поле «Канал PROFILE_SYN3» в окне подключения Syn3.

## 2. Бот Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → вкладка **Bot** → Add Bot.
2. **Reset Token** → скопируй токен (потом его не покажут).
3. Вкладка **Bot** → **Privileged Gateway Intents** → обязательно включи **Message Content Intent** и сохрани.
Без **Message Content Intent** Discord отдаёт сообщения **без текста**, и Syn3 не сможет читать конфиги и сообщения ревью.
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Bot Permissions:
     1. View Channel
     2. Read Message History
     3. Send Messages
     4. Create Public Threads
     5. Send Messages in Threads
     6. Attach Files
5. Открой сгенерированную ссылку и добавь бота на сервер.
6. Вставь токен в поле «Токен бота Discord» в Syn3.

### Приватный канал

Invite на сервер недостаточно. В настройках канала → Permissions добавь роль/бота и явно разреши как минимум View Channel, Read Message History, Send Messages (плюс Threads / Attach Files для постинга).

## 3. Дополнительные каналы

В блоке **Дополнительно** можно указать отдельные каналы для:

- проводника (файлы);
- заметок;
- ссылок;
- ревью (должен отличаться от остальных).

Если поле пустое, Syn3 использует канал PROFILE_SYN3 там, где это допустимо.

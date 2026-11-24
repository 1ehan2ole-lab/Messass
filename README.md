# Messass

Полнофункциональный веб-мессенджер в духе **Discord** + **Telegram**: серверы, каналы, личные сообщения, файлы, реакции, роли и статусы в реальном времени.

## Возможности

- **Регистрация и вход** — JWT-авторизация, хеширование паролей через `scrypt`, смена пароля.
- **Серверы и каналы** — создание серверов, текстовые/голосовые каналы, приглашения по коду или ссылке.
- **Личные сообщения** — создание чатов по поиску пользователя, удаление чата.
- **Сообщения в реальном времени** — Socket.IO: отправка, редактирование, удаление, ответы (reply), индикатор набора текста.
- **Вложения** — загрузка файлов до 25 МБ, превью изображений, карточки файлов.
- **Реакции** — эмодзи-реакции с подсчётом и переключением.
- **Статусы** — в сети / нет на месте / не беспокоить / невидимый / не в сети.
- **Роли** — владелец, администратор, участник; управление каналами и участниками.
- **Уведомления** — браузерные push-уведомления, когда вкладка неактивна.
- **Непрочитанные** — счётчики на серверах, каналах и в личных сообщениях, отметка прочитанного.
- **Поиск** — по пользователям и по сообщениям.
- **Профиль** — имя, «о себе», цвет аватара, настройки безопасности.
- **Адаптивный интерфейс** — тёмная тема, работает на десктопе и на мобильных.

## Технологии

| Слой | Стек |
| --- | --- |
| Фронтенд | React 19, Vite 6, Zustand, Socket.IO Client |
| Бэкенд | Node.js, Express 4, Socket.IO |
| База данных | SQLite (better-sqlite3, WAL) |
| Файлы | Multer, локальное хранилище |

## Быстрый старт

Требуется Node.js **20+**.

```bash
npm install          # корневые зависимости (concurrently)
npm run dev          # одновременно поднимает API (:3001) и клиент (:5173)
```

Откройте <http://localhost:5173>. Vite проксирует `/api`, `/uploads` и `/socket.io` на бэкенд.

### Production-режим (один порт)

```bash
npm run build        # собирает client/dist
npm start            # API + раздача статики на :3001
```

Откройте <http://localhost:3001>.

### Переменные окружения

Скопируйте `.env.example` в `server/.env` и при необходимости измените:

| Переменная | Назначение |
| --- | --- |
| `JWT_SECRET` | Секрет подписи токенов. **Обязательно замените в продакшене.** |
| `PORT` | Порт сервера (по умолчанию `3001`). |
| `DATA_DIR` | Каталог для БД и загруженных файлов. Укажите смонтированный диск на хостинге. |
| `CORS_ORIGIN` | Разрешённые origins через запятую или `*`. |
| `PUBLIC_URL` | Публичный URL, если приложение за Reverse Proxy. |

Сгенерировать секрет: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Тесты

```bash
# сервер должен быть запущен (npm run dev:server или npm start)
npm test
```

Тесты проверяют регистрацию/вход, серверы, каналы, сообщения, реакции, поиск, личные сообщения и контроль доступа.

## Деплой

### GitHub Pages (уже настроен)

Сайт доступен по адресу **https://1ehan2ole-lab.github.io/Messass/**. Workflow `.github/workflows/pages.yml` автоматически собирает клиент и публикует его.

Так как GitHub Pages умеет раздавать только статику, там включается **демо-режим**: данные хранятся в `localStorage`, синхронизируются между вкладками через `BroadcastChannel`, а серверные вызовы эмулируются (`client/src/demo.js`). В демо-режиме доступен весь интерфейс — серверы, каналы, сообщения, реакции, файлы, лички и т.д. Для входа нажмите **«Войти как демо-пользователь»** (или `demo@messass.app` / `demo1234`). Это версия для одного браузера, а не многопользовательский сервис.

### Полноценный многопользовательский режим

Настоящий общий сервер с БД и WebSocket запускается отдельно. Проект — один Node.js-процесс, который отдаёт и API, и frontend, поэтому подходит для большинства бесплатных хостингов (Render/Railway/Fly.io).

### Сервер на старом Android-телефоне (Termux)

Да, телефон можно использовать как мини-сервер. Требуется Android 7+ и Termux (ставьте с F-Droid, версия из Google Play устарела).

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git
termux-setup-storage
termux-wake-lock                 # не давать телефону усыпать процесс

git clone https://github.com/1ehan2ole-lab/Messass.git
cd Messass
npm install --prefix client
npm run build --prefix client
npm install --prefix server --omit=optional   # пропускаем нативный better-sqlite3
```

Запуск (используется встроенный в Node.js `node:sqlite`, сборка не нужна):

```bash
DB_DRIVER=node:sqlite \
DATA_DIR=$HOME/messass-data \
JWT_SECRET=$(openssl rand -hex 32) \
npm start
```

Если у вас Node 22, добавьте `NODE_OPTIONS=--experimental-sqlite`. На Node 24 флаг не нужен.

Чтобы открыть сервер извне, поднимите туннель (без аккаунта и домена):

```bash
# Cloudflare Quick Tunnel: скачайте cloudflared-linux-arm64 с releases.cloudflare.com
chmod +x cloudflared-linux-arm64
./cloudflared-linux-arm64 tunnel --url http://localhost:3001
```

Он выдаст случайный `https://....trycloudflare.com`. Откройте сайт на Pages с параметром:

```
https://1ehan2ole-lab.github.io/Messass/?server=https://ВАШ-ТУННЕЛЬ.trycloudflare.com
```

Сайт запомнит адрес сервера и будет работать в полноценном многопользовательском режиме. То же можно ввести на экране входа в поле «Подключить сервер».

Советы: держите телефон на зарядке (нагрев и расход батареи), отключите оптимизацию батареи для Termux, не обновляйте туннель слишком часто — при перезапуске адрес меняется.

Переменная `DB_DRIVER=node:sqlite` заставляет сервер использовать встроенный SQLite вместо `better-sqlite3`; на обычном ПК/хостинге лучше оставить `better-sqlite3` (быстрее).

### Render.com (рекомендуется)

1. Создайте **Web Service**, подключите репозиторий GitHub.
2. Build command: `npm install && npm install --prefix server && npm run build`
3. Start command: `npm start`
4. Добавьте **Disk** и смонтируйте его, например, в `/data`.
5. Env: `JWT_SECRET=<случайная строка>`, `DATA_DIR=/data`, `PUBLIC_URL=https://<ваш-сервис>.onrender.com`.

### Railway / Fly.io

Аналогично: build — `npm install && npm install --prefix server && npm run build`, start — `npm start`. Не забудьте постоянный volume для `DATA_DIR` и переменную `JWT_SECRET`.

### Локально через Docker (опционально)

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY server/package*.json server/
RUN npm install --prefix server
COPY client/package*.json client/
RUN npm install --prefix client
COPY . .
RUN npm run build
ENV DATA_DIR=/data PORT=3000
RUN mkdir -p /data
EXPOSE 3000
CMD ["npm", "start"]
```

## Структура

```
.
├── client/          # React-приложение (Vite)
│   └── src/
│       ├── components/  # экраны, чат, модалки
│       ├── api.js       # HTTP-клиент
│       ├── socket.js    # Socket.IO-клиент
│       ├── store.js     # состояние и бизнес-логика
│       └── styles.css
├── server/          # Express + Socket.IO + SQLite
│   └── src/
│       ├── routes/      # auth, servers, dms, messages, users
│       ├── db.js        # схема и подключение
│       ├── socket.js    # реальное время и presence
│       └── index.js     # точка входа
└── .github/workflows/ci.yml
```

## Краткая справка по API

- `POST /api/auth/register`, `POST /api/auth/login`, `GET/PATCH /api/auth/me`
- `GET/POST /api/servers`, `POST /api/servers/join`, `GET/PATCH/DELETE /api/servers/:id`
- `POST /api/servers/:id/channels`, `POST /api/servers/:id/invite`, `PATCH/DELETE /api/servers/:id/members/:userId`
- `GET/POST /api/dms`, `DELETE /api/dms/:id`
- `GET/POST /api/messages`, `PATCH/DELETE /api/messages/:id`, `POST /api/messages/:id/react`, `POST /api/messages/read`, `GET /api/messages/search`
- `GET /api/users?q=`, `GET /api/users/presence`
- `GET /api/health`

## Лицензия

MIT

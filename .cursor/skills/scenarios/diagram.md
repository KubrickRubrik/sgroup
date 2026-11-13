# Визуал sequence-схемы

Менять состав участников и порядок сообщений нельзя ради красоты. Колонки идут в порядке первого появления. `box` только вокруг соседних участников одной роли, иначе Mermaid переставит колонки.

Стрелки: `->>` вызов, `-->>` ответ. `Note` — граница, которая не является вызовом (перезапуск, следующий старт). `autonumber` оставлять.

## Тема

Каждая схема начинается с этого init. Кегль 20px не уменьшать.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': 'transparent', 'actorBkg': '#F7F4EF', 'actorBorder': '#8A8175', 'actorTextColor': '#1C1917', 'actorLineColor': '#D6D3D1', 'signalColor': '#44403C', 'signalTextColor': '#1C1917', 'noteBkgColor': '#ECFDF3', 'noteBorderColor': '#15803D', 'noteTextColor': '#14532D', 'fontSize': '20px', 'actorFontSize': '20px', 'messageFontSize': '20px', 'noteFontSize': '20px', 'sequenceNumberColor': '#FFFFFF'}}}%%
```

## Рамки

Первое слово `box` — цвет, дальше подпись роли.

| Роль | box |
|---|---|
| Человек | `OldLace` |
| Flutter, экран, следующий Flutter-старт | `AliceBlue` |
| Натив | `HoneyDew` |
| Хранилище, если оно не внутри блока натива | `Cornsilk` |

## Полосы фаз

`rect` красит уже существующие сообщения, новых шагов не добавляет. Над схемами одна легенда, если фаз больше одной:

- чтение — `rect rgb(239, 246, 255)`
- запись — `rect rgb(255, 247, 237)`
- момент, когда новое состояние начинает использоваться — `rect rgb(240, 253, 244)`

## Тёмные тона

Только если пользователь прямо просит тёмную схему. Состав сообщений тот же. Init заменить на:

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'darkMode': true, 'background': '#141210', 'primaryColor': '#292524', 'primaryTextColor': '#FAFAF9', 'primaryBorderColor': '#78716C', 'lineColor': '#A8A29E', 'textColor': '#FAFAF9', 'actorBkg': '#292524', 'actorBorder': '#A8A29E', 'actorTextColor': '#FAFAF9', 'actorLineColor': '#57534E', 'signalColor': '#D6D3D1', 'signalTextColor': '#FAFAF9', 'noteBkgColor': '#14532D', 'noteBorderColor': '#4ADE80', 'noteTextColor': '#DCFCE7', 'labelBoxBkgColor': '#1C1917', 'labelBoxBorderColor': '#78716C', 'labelTextColor': '#FAFAF9', 'fontSize': '20px', 'actorFontSize': '20px', 'messageFontSize': '20px', 'noteFontSize': '20px', 'sequenceNumberColor': '#FAFAF9'}}}%%
```

Рамки: человек `rgb(68, 52, 38)`, Flutter `rgb(30, 58, 95)`, натив или следующий запуск `rgb(22, 64, 52)`, хранилище `rgb(92, 64, 18)`. Полосы: чтение `rgb(23, 37, 64)`, запись `rgb(68, 46, 22)`, применение `rgb(15, 46, 34)`.

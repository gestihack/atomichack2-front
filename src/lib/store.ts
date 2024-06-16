import { writable } from "svelte/store"
import type { BotMsg, LLMAnswer, LLMAnswerGuides, LLMAnswerSimilarities, OwnMsg } from "./utils"

export const msgs = writable<
    (
        BotMsg | OwnMsg
    )[]
>([])

export const wsconn = writable<WebSocket | null>(null)

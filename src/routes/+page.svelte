<script lang="ts">
    import "../app.scss"
    import GestiLogo from "$lib/components/gesti.tech.svelte"
    import Button from "@/components/ui/button/button.svelte"
    import { LoaderCircle, MoveUp } from "lucide-svelte"
    import Textarea from "@/components/ui/textarea/textarea.svelte"
    import { fade, slide } from "svelte/transition"
    import {
        autoUpdate,
        offset,
        useFloating,
        useInteractions,
        useRole,
        useDismiss,
        size,
    } from "@skeletonlabs/floating-ui-svelte"
    import { msgs, wsconn } from "@/store"
    import type {
        BotMsg,
        LLMAnswer,
        LLMAnswerSimilarities,
        LLMAnswerGuides,
    } from "@/utils"
    import * as Accordion from "@/components/ui/accordion"
    import * as Carousel from "@/components/ui/carousel"
    import * as Card from "@/components/ui/card"
    import * as Dialog from "@/components/ui/dialog"

    function takeUntil<T>(
        array: T[],
        predicate: (element: T, index: number) => boolean,
    ) {
        const result = []
        for (let i = 0; i < array.length; i++) {
            if (!predicate(array[i], i)) {
                break
            }
            result.push(array[i])
        }
        return result
    }

    let chat: HTMLTextAreaElement
    let completionsOpen = true
    let stopgen = true
    $: similar = [] as LLMAnswerSimilarities
    $: guides = [] as LLMAnswerGuides
    const floating = useFloating({
        whileElementsMounted: autoUpdate,
        get open() {
            return completionsOpen
        },
        onOpenChange: (v) => (completionsOpen = v),
        strategy: "absolute",
        placement: "top-start",
        get middleware() {
            return [
                offset({
                    mainAxis: 6,
                    crossAxis: 20,
                }),
                size({
                    apply: ({ availableWidth, availableHeight, elements }) => {
                        let q = document.querySelector(".input")
                        Object.assign(elements.floating.style, {
                            width: `${q?.getBoundingClientRect().width}px`,
                            maxHeight: `${availableHeight}px`,
                        })
                    },
                }),
            ]
        },
    })

    const role = useRole(floating.context, { role: "menu" })
    const dismiss = useDismiss(floating.context, {
        outsidePress: (event) =>
            ((event.target as HTMLElement)?.className &&
                !(event.target as HTMLDivElement).className.includes(
                    "suggest",
                )) === true,
    })
    const interactions = useInteractions([dismiss, role])
    let started = $msgs.length > 0
    let loading = false

    let timer: any
    const debounce = (clb: () => void, timeout: number) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
            clb()
        }, timeout)
    }

    let sendBtn: HTMLButtonElement
    let operator = false
    let msgbox: HTMLDivElement
    let chatVal: string

    $: completionAnswer = [] as string[]

    function onMsg() {
        setTimeout(() => {
            let q = document.querySelector(".msgbox")
            if (q) {
                q.scrollTo({
                    top: 100000,
                    behavior: "smooth",
                })
            }
        }, 200)
    }

    function postMessage(content: string) {
        chatVal = ""
        loading = true
        started = true
        completionsOpen = false
        stopgen = false

        $msgs.push({
            type: "own",
            text: content.trim(),
        })
        $msgs = $msgs
        onMsg()

        receiveAnswer().then(() => {
            loading = false
        })
    }
    function chatKeydown(evt: KeyboardEvent) {
        if (evt.keyCode == 13) {
            // do nothing
        }
        if (evt.keyCode == 13 && !evt.shiftKey) {
            postMessage(chatVal)
            chatVal = ""
            evt.stopPropagation()
            evt.preventDefault()
            completionsOpen = false
        }
    }
    function chatInput() {
        completionsOpen = false
        debounce(async () => {
            if (loading || completionsOpen) return
            if (chatVal.length < 3) return
            const res = await fetch("https://os-hacks.gesti.tech/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: chatVal,
                }),
            })
            if (res.ok) {
                const data = await res.json()
                completionAnswer = data as string[]
                completionsOpen = true
            }
            completionsOpen = completionAnswer.length > 0
        }, 100)
    }
    async function receiveAnswer() {
        loading = true
        if ($wsconn === null || !$wsconn.OPEN) {
            $wsconn = new WebSocket("wss://llm-hacks.gesti.tech/")
            // $wsconn = new WebSocket('ws://localhost:9000')
        }
        const recv = (msg: any) => {
            const data: LLMAnswer = JSON.parse(msg.data)
            if (data.type === "starting") {
                const lastMsg = $msgs[$msgs.length - 1] as BotMsg
                lastMsg["guides"] = data.guides
                lastMsg["similar"] = data.similar
                similar = data.similar
                guides = data.guides
                onMsg()
            } else if (data.type === "token") {
                let oldTxt = $msgs[$msgs.length - 1]["text"]
                if (oldTxt === "Думаю...") {
                    oldTxt = ""
                }
                $msgs[$msgs.length - 1]["text"] = oldTxt + data.msg
            } else if (data.type === "done") {
                // ws.close()
                // DISPLAY SIMILAR ??
                stopgen = true
            } else if (data.type === "stop") {
                $msgs[$msgs.length - 1]["text"] = data.msg
                setTimeout(() => {
                    $msgs.push({
                        type: "bot",
                        text: "Добрый день, меня зовут Анастасия, чем могу помочь?",
                    })
                    $msgs = $msgs
                    onMsg()
                }, 1500)
                loading = false
            }
        }
        $wsconn.addEventListener("message", recv)
        $wsconn.addEventListener("open", function (event) {
            this.send($msgs[$msgs.length - 1]["text"])
            $msgs.push({
                type: "bot",
                text: "Думаю...",
            })
            $msgs = $msgs
            onMsg()
        })
    }
    function callOperator() {
        if ($wsconn && $wsconn.OPEN) {
            $wsconn.close()
        }
        operator = true
        stopgen = false
        $msgs.push({
            type: "bot",
            text: "Переключаю на оператора",
        })
        $msgs = $msgs
        onMsg()
        setTimeout(() => {
            $msgs.push({
                type: "bot",
                text: "Добрый день, меня зовут Анастасия, чем могу помочь?",
            })
            $msgs = $msgs
            onMsg()
        }, 1500)
    }
</script>

<div class="flex w-screen h-screen px-[10%] md:px-[18%]">
    <div class="bg-gray-300 w-full h-full flex flex-col gap-y-5 pt-10">
        <div class="w-auto h-14 p-4">
            <GestiLogo />
        </div>

        {#if !started}
            <div class="h-full pt-[20vh] text-[64px] font-bold">
                Привет, это <span class="text-blue-700">chatom</span>!
            </div>
        {:else}
            <div
                bind:this={msgbox}
                class="msgbox w-full min-h-[68vh] overflow-y-auto flex flex-col gap-y-2">
                <div class="w-full h-10 text-center text-gray">Сегодня</div>

                {#each $msgs as msg}
                    <div
                        class="p-4 w-fit max-w-[40vw]"
                        class:own={msg.type === "own"}
                        class:bot={msg.type === "bot"}>
                        {msg.text}
                        {#if msg.type === "bot" && msg.guides && msg.guides.length > 0}
                            <div in:fade>
                                <Accordion.Root class="w-full sm:max-w-[70%]">
                                    <Accordion.Item value="item-1">
                                        <Accordion.Trigger>
                                            Источники
                                        </Accordion.Trigger>
                                        <Accordion.Content class="">
                                            <div class="flex flex-col gap-y-2">
                                                {#each msg.guides as guide}
                                                    <div
                                                        class="bg-[#4495D1]/20 w-full p-2 flex place-content-between rounded-lg">
                                                        <span
                                                            >{guide.guide}</span>
                                                        <span
                                                            title="Совпадение"
                                                            class="ml-2 text-secondary-foreground/60"
                                                            >{Math.floor(
                                                                guide.score *
                                                                    100,
                                                            )}%
                                                        </span>
                                                    </div>
                                                {/each}
                                            </div>
                                        </Accordion.Content>
                                    </Accordion.Item>
                                </Accordion.Root>
                            </div>
                        {/if}
                    </div>
                    {#if msg.type === "bot" && stopgen}
                        <div in:fade class="py-2">
                            <Button
                                on:click={callOperator}
                                variant="outline">Вызвать оператора</Button>
                        </div>
                    {/if}
                {/each}
                {#if similar.length > 0 && !operator}
                    <div
                        class="mt-auto h-fit flex flex-col flex-1 flex-grow place-items-center place-content-center"
                        in:fade>
                        <span class="self-start text-[#A9A9A9]"
                            >Похожие вопросы, на которые уже ответили</span>
                        <Carousel.Root
                            opts={{
                                align: "start",
                            }}
                            class="w-full max-w-[100%]">
                            <Carousel.Content class="w-full">
                                {#each similar as sim}
                                    <Dialog.Root preventScroll={false}>
                                        <Carousel.Item
                                            class="basis-1/2 xl:basis-1/3 2xl:basis1/4">
                                            <div class="p-1">
                                                <Card.Root
                                                    class="max-h-[500px]">
                                                    <Card.Header>
                                                        <Card.Title
                                                            class="font-medium text-[20px] text-[#203CB8] leading-6">
                                                            {takeUntil(
                                                                sim.q.split(
                                                                    " ",
                                                                ),
                                                                (_, i) => i < 8,
                                                            ).join(" ")}
                                                            <!-- контакты связи проведения расчета себестоимости сентябре октябре отчету сверка оперативного бухгалтеркого учета присутствует расхождения копейки посмотреть изза происходит расхождение осв регистрами -->
                                                        </Card.Title>
                                                    </Card.Header>
                                                    <Card.Content
                                                        class="flex items-center justify-center px-8">
                                                        <span
                                                            class="text-[16px]">
                                                            <!-- {sim.a} -->
                                                            {takeUntil(
                                                                sim.a.split(
                                                                    " ",
                                                                ),
                                                                (_, i) => i < 8,
                                                            ).join(" ")}
                                                            <!-- в системе выполнены новые настройки для погрешности расчета себестоимости позволяющие избежать расхождений для данной ситуации было протестировано на копии расхождения ушли при возникновении новых расхождений в отчете по сверке оу и бу прошу создать новую ошибку так как природа возникновения отклонений различна и решение может быть другим во вложении используемая настройка -->
                                                        </span>
                                                    </Card.Content>
                                                    <Card.Footer
                                                        class="flex justify-between w-full">
                                                        <span
                                                            class="text-[#A9A9A9]"
                                                            >{Math.floor(
                                                                sim.score * 100,
                                                            )}%</span>
                                                        <Dialog.Trigger>
                                                            <span
                                                                class="text-[#203CB8] text-[15px] underline cursor-pointer">
                                                                Подробнее
                                                            </span>
                                                        </Dialog.Trigger>
                                                    </Card.Footer>
                                                </Card.Root>
                                            </div>
                                        </Carousel.Item>
                                        <Dialog.Content class="max-w-[80vw]">
                                            <Dialog.Header>
                                                <Dialog.Title>
                                                    {takeUntil(
                                                        sim.q.split(" "),
                                                        (_, i) => i < 8,
                                                    ).join(" ")}</Dialog.Title>
                                                <Dialog.Description>
                                                </Dialog.Description>
                                            </Dialog.Header>
                                            <div class="flex flex-col gap-y-1">
                                                <span class="underline"
                                                    >Вопрос:
                                                </span>
                                                <div
                                                    class="font-medium text-[16px]">
                                                    {sim.q}
                                                </div>
                                                <span class="underline"
                                                    >Ответ:</span>
                                                <div
                                                    class="font-medium text-[16px]">
                                                    {sim.a}
                                                </div>
                                            </div>
                                            <Dialog.Footer>
                                                <Dialog.Close>
                                                    <Button type="submit"
                                                        >Закрыть</Button>
                                                </Dialog.Close>
                                            </Dialog.Footer>
                                        </Dialog.Content>
                                    </Dialog.Root>
                                {/each}
                            </Carousel.Content>
                        </Carousel.Root>
                    </div>
                {/if}
            </div>
        {/if}
        <form class="input-box py-10 flex gap-x-4 place-items-center">
            {#if completionsOpen}
                <div
                    bind:this={floating.elements.floating}
                    {...interactions.getFloatingProps()}
                    style={floating.floatingStyles}
                    in:slide
                    class="floating flex flex-col gap-y-1 p-2 shadow-sm border-[#F2F4F7] border-[1px]">
                    {#each completionAnswer as suggest}
                        <div
                            on:keypress
                            tabindex="-1"
                            on:click|preventDefault|capture={() => {
                                chatVal = suggest
                                completionsOpen = false
                            }}
                            role="button"
                            class="suggest cursor-pointer hover:bg-secondary rounded-xl p-1 py-2">
                            {suggest}
                        </div>
                    {/each}
                </div>
            {/if}
            <span
                class="self-start"
                bind:this={floating.elements.reference}>
            </span>
            <Textarea
                on:keydown={chatKeydown}
                on:keyup
                on:input={chatInput}
                bind:value={chatVal}
                {...interactions.getReferenceProps()}
                placeholder="Чем вам помочь?"
                disabled={loading}
                class="input rounded-xl text-lg min-h-[50px]">
            </Textarea>
            <Button
                on:click={() => {
                    postMessage(chatVal)
                }}
                disabled={loading}
                class="send-btn rounded-full aspect-square bg-blue-700 hover:bg-blue-800">
                {#if loading}
                    <LoaderCircle class="animate-spin absolute w-5 h-5" />
                {:else}
                    <MoveUp
                        class="arrow absolute w-5 h-5 transition-transform" />
                {/if}
            </Button>
        </form>
    </div>
</div>

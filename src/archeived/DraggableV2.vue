<template>
    <div
        ref="container"
        style="display: flex;"
        :style="{flexDirection: vertical ? 'column': 'row'}"
    >
        <template v-for="(pair, i) in orderedPairs">
            <div
                :class="startIndex === -1 || startIndex === i ? '':'transition-swing'"
                ref="items"
                @mousedown.left.prevent.stop="dragstart($event, i)"
                :style="itemStyle(i)"
                :key="pair.index"
            >
                <slot
                    :item="pair.item"
                    :index="i"
                    :origin-index="pair.index"
                    :dragging="startIndex === i && isDragging"
                    name="item"
                />
            </div>
        </template>
    </div>
</template>

<script>
import throttle from 'lodash/throttle'
// Fixme 拖拽时item宽度变化，列表会闪动
// TODO 不可拖动物体
// TODO 能否优化拖拽container和item的dom结构
// Fixme 鼠标拖动时，点击屏幕，触发一次mousemove，导致动画错误
const throttleMs = 50
export default {
    name: 'DraggableV2',
    model: {
        prop: 'order',
        event: 'change'
    },
    props: {
        vertical: { type: Boolean, default: false },
        items: { type: Array, required: true },
        transitionDuration: { type: Number, default: 2000 },
        group: { type: Array },
        useThrottle: { type: Boolean, default: false },
        order: { type: Array }
    },
    data: () => ({
        moveToIndex: -1,
        startIndex: -1,
        startEvent: null,
        currentIndex: -1,
        // Fixme 这个属性应该去掉，不够精确，其实只用到了screenX/Y
        currentEvent: null,
        endPosition: null,
        boxes: [],
        isDragging: false,
        isDropAnimation: false,
        windowDragoverHandler: null,
        innerOrder: [],
        containerRect: null
    }),
    computed: {
        orderedPairs () {
            const orderedList = []
            const originList = this.items || []
            const order = this.innerOrder
            for (let i = 0; i < originList.length; ++i) {
                const index = order[i]
                orderedList.push({
                    item: originList[index],
                    index
                })
            }
            // console.log('paris', orderedList)
            return orderedList
        },
        itemStyle () {
            return i => {
                let s = {}
                s.cursor = 'move'
                if (
                    this.currentIndex === -1 ||
                    this.startIndex === -1 ||
                    (!this.isDragging && !this.isDropAnimation)
                ) {
                    return s
                }
                // (optional) dragging/dragend-active-start-el
                if (i === this.startIndex) {
                    s.zIndex = 2
                    s.opacity = 0.5
                    s.cursor = 'move'
                } else {
                    s.cursor = null
                }

                // dragging/dragend-active-other-el
                if (this.startIndex !== i) {
                    s.transitionDuration = `${this.transitionDuration}ms !important`
                    s.pointerEvents = 'none'
                }
                // dragend-active-start-el
                if (this.startIndex === i && this.isDropAnimation) {
                    s.transitionDuration = `${this.transitionDuration}ms !important`
                }
                // dragging-start-el
                if (this.startIndex === i && this.isDragging) {
                    s.transitionDuration = (this.useThrottle ? throttleMs : 10) + 'ms'
                    s.transitionTimingFunction = 'linear'
                    s.transitionProperty = 'all'
                }

                const [start, to, cX, cY, sX, sY] = [
                    this.startIndex,
                    this.moveToIndex,
                    this.currentEvent.screenX,
                    this.currentEvent.screenY,
                    this.startEvent.screenX,
                    this.startEvent.screenY
                ]

                // dynamic style
                if (i === start) {
                    const endP = this.endPosition
                    if (this.vertical) {
                        s.transform = `translateY(${endP == null ? cY - sY : endP}px)`
                    } else {
                        s.transform = `translateX(${endP == null ? cX - sX : endP}px)`
                    }
                }
                if ((i > start && i <= to) || (i >= to && i < start)) {
                    const length = this.vertical ? this.boxes[start].height : this.boxes[start].width
                    s.transform = this.vertical
                        ? `translateY(${start < to ? '-' : ''}${length}px)`
                        : `translateX(${start < to ? '-' : ''}${length}px)`
                }
                return s
            }
        }
    },
    created () {
        this.$watch('items', (v) => {
            // check if is same array
            // console.log('item change', v)
            this.innerOrder = this.items.map((t, i) => i)
            this.emitOrder()
        }, { immediate: true })
        this.$watch('order', (v) => {
            // console.log('order change', v)
            if (
                Array.isArray(v) &&
                v.length === this.items.length &&
                !this.arrayEqual(v, this.innerOrder)
            ) {
                this.innerOrder = [...v]
            }
        })
    },
    beforeDestroy () {
        this.removeWindowOverEvent()
    },
    methods: {
        arrayEqual (a, b) {
            return Array.isArray(a) &&
                Array.isArray(b) &&
                JSON.stringify(this.order) === JSON.stringify(this.innerOrder)
        },
        emitOrder (options = { force: false }) {
            // console.log('emit Order')
            let checkResult = true
            if (!options.force) {
                checkResult = !this.arrayEqual(this.order, this.innerOrder)
            }
            if (checkResult) {
                this.$emit('change', [...this.innerOrder])
            }
        },
        log (...args) {
            console.log(...args)
        },
        registerWindowOverEvent () {
            if (!this.windowDragoverHandler) {
                this.windowDragoverHandler = e => {
                    // console.log('window dragover', e)
                    this.dragover(e)
                }
                window.addEventListener('mousemove', this.windowDragoverHandler)
            }
        },
        removeWindowOverEvent () {
            if (this.windowDragoverHandler) {
                window.removeEventListener('mousemove', this.windowDragoverHandler)
                this.windowDragoverHandler = null
            }
        },
        getOverIndex (e) {
            const [cX, cY] = [
                e.screenX,
                e.screenY
            ]
            const rect = this.containerRect
            const offset = this.vertical ? cY - rect.top : cX - rect.left
            // let first = this.boxes[0]
            // let last = this.boxes[this.boxes.length - 1]
            // // don't move if exceed left/top
            // if (first) {
            //     const firstSize = this.vertical ? first.height : first.width
            //     if (offset < firstSize) return
            // }
            // // don't move if exceed right/bottom
            // if (last) {
            //     const lastSize = this.vertical ? last.height : last.width
            //     const total = this.boxes.reduce((t, b) => t + (this.vertical ? b.height : b.width), 0)
            //     if (offset > (total - lastSize)) return
            // }
            let i = 0
            let total = 0
            for (let box of this.boxes) {
                total += this.vertical ? box.height : box.width
                if (offset < total) {
                    break
                } else {
                    i += 1
                }
            }
            // console.log(offset, i)
            return i
        },
        clear () {
            this.moveToIndex = -1
            this.startEvent = null
            this.startIndex = -1
            this.currentEvent = null
            this.currentIndex = -1
            this.endPosition = null
            this.containerRect = null
        },
        calculateBoxes () {
            const boxes = this.$refs.items.map((el, index) => ({
                width: el.offsetWidth,
                height: el.offsetHeight,
                index
            }))
            const orderedBoxes = []
            const order = this.innerOrder
            for (let i = 0; i < boxes.length; ++i) {
                orderedBoxes[i] = boxes[order[i]]
            }
            this.boxes = orderedBoxes
        },
        dragstart (e, i) {
            if (this.isDragging) return
            if (!(e instanceof MouseEvent)) return
            console.log('dragstart', e)
            this.startIndex = i
            this.moveToIndex = i
            this.startEvent = e
            this.isDragging = true
            this.containerRect = this.$refs.container.getBoundingClientRect()
            this.registerWindowOverEvent()
            // console.log('dragstart', this.startIndex)

            // e.dataTransfer.setDragImage(new Image(), 0, 0)
            // e.dataTransfer.dropEffect = 'move'
            // e.dataTransfer.effectAllowed = 'move'
            this.calculateBoxes()

            window.addEventListener('mouseup', e => {
                this.dragend(e)
            }, { once: true })
            // window.addEventListener('touchend', e => {
            //     this.dragend(e)
            // }, { once: true })
            // console.log('boxes', this.boxes)
        },
        dragover (e, i) {
            if (!this.isDragging) return
            if (!(e instanceof MouseEvent)) return
            if (!e.movementX && !e.movementY) return
            // console.log('dragover', i)
            // e.dataTransfer.dropEffect = 'move'
            this.moveTab(e, i)
        },
        moveTab (e, i) {
            if (this.useThrottle) {
                this.throttleMoveTab(e, i)
            } else {
                this.moveTab_(e, i)
            }
        },
        throttleMoveTab: throttle(function (e, i) {
            this.moveTab_(e, i)
        }, throttleMs, { trailing: false }),
        moveTab_ (e, i) {
            if (!e) return
            if (i == null) {
                i = this.getOverIndex(e)
                if (i == null) return
            }
            // console.log('1   movetab', i)
            this.currentEvent = e
            this.currentIndex = i
            const [start, to, sX, sY, cX, cY] = [
                this.startIndex,
                this.moveToIndex,
                this.startEvent.screenX,
                this.startEvent.screenY,
                e.screenX,
                e.screenY
            ]

            // displacement（位移）
            const dX = cX - sX
            const dY = cY - sY
            let d = this.vertical ? dY : dX

            const hasMoved = this.boxes
                .filter((b, i) => {
                    return d > 0 ? i > start && i <= to : i < start && i >= to
                })
                .reduce((t, b) => {
                    return this.vertical ? t + b.height : t + b.width
                }, 0)
            // console.log('move', dX, dY, hasMoved)
            let adjacent
            adjacent = d > 0 ? this.boxes[to + 1] : this.boxes[to - 1]
            if (adjacent) {
                let threshold = this.vertical ? adjacent.height * 0.5 : adjacent.width * 0.5
                // over next box
                // console.log('move', Math.abs(d) - hasMoved)
                if (Math.abs(d) - hasMoved >= threshold) {
                    if (d > 0) {
                        this.moveToIndex++
                    } else {
                        this.moveToIndex--
                    }
                    // console.log('over threshold', d, hasMoved, threshold)
                }
                // console.log('adjacent', adj.width)
            }
            // is move back
            const lastThreshold = to === start ? 0 : this.vertical
                ? this.boxes[to].height * 0.5
                : this.boxes[to].width * 0.5
            // console.log('lastThreshold', lastThreshold)
            if (Math.abs(d) - (hasMoved - lastThreshold) < 0) {
                if (d > 0) {
                    this.moveToIndex--
                } else {
                    this.moveToIndex++
                }
                // console.log('moveback', d, hasMoved)
            }
        },
        dragend (e) {
            if (!this.isDragging) return
            if (!(e instanceof MouseEvent)) return
            this.removeWindowOverEvent()
            // console.log('dragend', e)
            // const el = e.target
            const [start, to, sX, sY, cX, cY] = [
                this.startIndex,
                this.moveToIndex,
                this.startEvent.screenX,
                this.startEvent.screenY,
                e.screenX,
                e.screenY
            ]

            // displacement（位移）
            const dX = cX - sX
            const dY = cY - sY
            let d = this.vertical ? dY : dX
            // const rect = el.getBoundingClientRect()
            const targetLength = this.boxes
                .filter((b, i) => {
                    return d > 0 ? i > start && i <= to : i < start && i >= to
                })
                .reduce((t, b) => {
                    return this.vertical ? t + b.height : t + b.width
                }, 0)
            // console.log('adjust position', targetLength, d)
            this.endPosition = targetLength * (d > 0 ? 1 : -1)
            this.isDragging = false
            this.isDropAnimation = true
            setTimeout(() => {
                this.clear()
                if (start !== to) {
                    const newOrder = this.move(this.innerOrder, start, to)
                    // console.log('new Order', newList)
                    this.innerOrder = newOrder
                    this.emitOrder({ force: true })
                    this.$emit('move', { from: start, to: to, order: [...newOrder] })
                    // console.log('emit items')
                    this.$emit('update:items', this.orderedPairs.map(p => p.item))
                    this.isDropAnimation = false
                }
            }, this.transitionDuration)
        },
        move (list, from, to) {
            list = [...list]
            if (from !== to && from >= 0 && from < list.length && to >= 0 && to < list.length) {
                // insertIndex是真正插入的地方
                let insertIndex = to
                let temp = list[from]
                list.splice(from, 1)
                list.splice(insertIndex, 0, temp)
                // console.log('moved', this.list)
            }
            return list
        }
    }
}
</script>

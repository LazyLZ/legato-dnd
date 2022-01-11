<template>
    <div ref="container" style="display: flex" @dragover.prevent="dragover($event, -2)" @drop="drop($event, -2)">
        <template v-for="(item, i) in items">
            <div
                class="grabbable"
                :class="startIndex === -1 ? '':'transition-swing'"
                ref="items"
                draggable="true"
                @dragstart="dragstart($event, i)"
                @dragover.prevent="dragover($event, i)"
                @drop.prevent="drop($event, i)"
                @dragend="dragend"
                :style="itemStyle(i)"
                :key="i"
            >
                <slot
                    :item="item" :index="i" name="item"
                />
            </div>
        </template>
    </div>
</template>

<script>
import throttle from 'lodash/throttle'
// Fixme 拖动时光标会闪
// Fixme 无法修改光标
export default {
    name: 'Draggable',
    model: {
        prop: 'items'
    },
    props: {
        vertical: {
            type: Boolean,
            default: false
        },
        width: {
            type: Number,
            required: true
        },
        items: {
            type: Array,
            required: true
        },
        transitionDuration: {
            type: Number,
            default: 300
        }
    },
    data: () => ({
        moveToIndex: -1,
        startIndex: -1,
        activeIndex: -1,
        startEvent: null,
        currentIndex: -1,
        currentEvent: null,
        endPosition: null,
        boxes: []
    }),
    computed: {
        itemStyle () {
            return i => {
                let s = {}
                if (i === this.activeIndex) {
                    s.zIndex = 2
                }
                if ([this.currentIndex, this.startIndex].some(v => v === -1)) {
                    return s
                }
                s.transitionDuration = `${this.transitionDuration}ms !important`

                const [start, to, cX, cY, sX, sY] = [
                    this.startIndex,
                    this.moveToIndex,
                    this.currentEvent.pageX,
                    this.currentEvent.pageY,
                    this.startEvent.pageX,
                    this.startEvent.pageY
                ]
                if (i === start) {
                    s.pointerEvents = 'none'
                    const endP = this.endPosition
                    if (this.vertical) {
                        s.transform = `translateY(${endP == null ? cY - sY : endP}px)`
                    } else {
                        s.transform = `translateX(${endP == null ? cX - sX : endP}px)`
                    }
                }
                if ((i > start && i <= to) || (i >= to && i < start)) {
                    const length = this.vertical ? this.boxes[start].height : this.boxes[start].width
                    s.transform = `translateX(${start < to ? '-' : ''}${length}px)`
                }
                return s
            }
        }
    },
    created () {
        this.order = this.items.map((t, i) => i)
    },
    methods: {
        clear () {
            this.moveToIndex = -1
            this.startEvent = null
            this.startIndex = -1
            this.currentEvent = null
            this.currentIndex = -1
            this.endPosition = null
        },
        dragstart (e, i) {
            this.startIndex = i
            this.moveToIndex = i
            this.activeIndex = i
            this.startEvent = e
            // console.log('dragstart', this.startIndex)

            e.dataTransfer.setDragImage(new Image(), 0, 0)
            e.dataTransfer.dropEffect = 'move'
            e.dataTransfer.effectAllowed = 'move'
            this.boxes = this.$refs.items.map((el, index) => ({
                width: el.offsetWidth,
                height: el.offsetHeight,
                index
            }))
            // console.log('boxes', this.boxes)
        },
        dragover (e, i) {
            e.dataTransfer.dropEffect = 'move'
            this.moveTab(e, i)
        },
        moveTab: throttle(function (e, i) {
            this.currentEvent = e
            this.currentIndex = i
            const [start, to, sX, sY, cX, cY] = [
                this.startIndex,
                this.moveToIndex,
                this.startEvent.pageX,
                this.startEvent.pageY,
                e.pageX,
                e.pageY
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
        }, 50, { trailing: false }),
        drop (e, i) {
        },
        dragend (e) {
            // const el = e.target
            const [start, to, sX, sY, cX, cY] = [
                this.startIndex,
                this.moveToIndex,
                this.startEvent.pageX,
                this.startEvent.pageY,
                e.pageX,
                e.pageY
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

            setTimeout(() => {
                this.clear()
                if (start !== to) {
                    const newList = this.move(this.items, start, to)
                    // console.log('new Order', newList)
                    this.$emit('input', newList)
                    this.$emit('move', { from: start, to: to })
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

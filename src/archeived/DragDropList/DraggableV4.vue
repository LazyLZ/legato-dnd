<template>
    <div ref="container">
        <template v-for="(item, i) in items">
            <div :class="DRAGGABLE_CLASS" :key="i">
                <slot
                    :item="item"
                    :index="i"
                    :dragging="startIndex === i"
                    name="item"
                />
            </div>
        </template>
    </div>
</template>

<script>
import { DragDrop, DRAGGABLE_CLASS } from '@/components/DragDropList/DragDropV2'

export default {
    name: 'DraggableV4',
    props: {
        vertical: { type: Boolean, default: false },
        items: { type: Array, required: true },
        transitionDuration: { type: Number, default: 200 },
        order: { type: Array }
    },
    model: {
        prop: 'order',
        event: 'change'
    },
    data: () => ({
        DRAGGABLE_CLASS,
        dragdrop: null,
    }),
    computed: {
        startIndex () {
            return this.dragdrop && this.dragdrop.startIndex
        }
    },
    mounted () {
        const { vertical, transitionDuration } = this
        this.dragdrop = new DragDrop({
            container: this.$refs.container,
            vertical,
            transitionDuration,
            // startDelay: 1000,
            // startOffsetTolerate: 10,
            // restrictMove: true
        })
        this.dragdrop.on('moveToEdge', e => {
            console.log('moveToEdge', e)
        })
        this.dragdrop.on('orderChange', ({ order }) => {
            const newItems = this.items.map((t, i) => this.items[order[i]])
            // console.log('order change', order)
            this.$emit('update:items', newItems)
        })
    }
}
</script>

<style scoped>

</style>

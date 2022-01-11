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
import { BaseEngine, DRAGGABLE_CLASS } from '@/components/DragDropList/DragDropEngine'

export default {
    name: 'DraggableV3',
    props: {
        vertical: { type: Boolean, default: false },
        items: { type: Array, required: true },
        transitionDuration: { type: Number, default: 2000 },
        useThrottle: { type: Boolean, default: false },
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
        this.dragdrop = new BaseEngine({
            container: this.$refs.container,
            vertical,
            transitionDuration
        })
        this.dragdrop.on('move', ({ order }) => {
            const newItems = this.items.map((t, i) => this.items[order[i]])
            // this.$emit('change', order)
            this.$emit('update:items', newItems)
        })
    }
}
</script>

<style scoped>

</style>

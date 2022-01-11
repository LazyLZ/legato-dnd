<template>
    <div @touchmove="log" @wheel="log">
        <div style="max-width: 1000px; margin: auto" class="pa-4">
            <!--<v-btn @click="vibrate()">vibrate</v-btn>-->
            <div style="margin-top: 1000px"></div>
            <div>{{ active }}</div>
            <div>{{ order }}</div>
            <div style="height: 300px;overflow: auto">
                <div style="height: 600px"></div>
            </div>
            <div style="overflow: auto; height: 900px; position: relative">
                <div style="height: 300px"></div>
                <div style="overflow: auto; height: 500px">
                    <DraggableV4 vertical :items.sync="items" v-model="order">
                        <template #item="{item}">
                            <div :style="itemStyle" class="d-flex">
                                {{ item.name }}
                                <v-text-field
                                    @touchstart.stop
                                    @mousedown.stop
                                    outlined dense label="text"/>
                            </div>
                        </template>
                    </DraggableV4>
                </div>
                <div style="height: 300px"></div>
            </div>
            <div style="height: 300px;overflow: auto">
                <div style="height: 600px"></div>
            </div>
            <div v-if="false">
                <v-tabs
                    ref="tab"
                    v-model="active"
                    show-arrows
                    hide-slider
                    small
                >
                    <DraggableV2 :width="130" style="align-items: stretch" :items="items">
                        <template #item="{item, originIndex: i}">
                            <v-tab
                                class="pr-1 d-flex justify-space-between align-center"
                                :class="active === i ? '': 'grey lighten-4'"
                                active-class="primary lighten-4"
                                style="text-transform: none; height: 100%;max-width: 180px"
                            >
                                <span class="text-truncate">{{ item.name }}{{ i }}</span>
                                <v-btn @click.stop class="ml-1" small icon>
                                    <v-icon small v-text="'mdi-close'"/>
                                </v-btn>
                            </v-tab>
                        </template>
                    </DraggableV2>
                </v-tabs>
            </div>
            <div style="height: 500px"></div>
        </div>
    </div>
</template>

<script>
import DraggableV2 from '@/components/DraggableV2'
// import DraggableV3 from '@/components/DragDropList/DraggableV3'
import DraggableV4 from '@/components/DragDropList/DraggableV4'

export default {
    name: 'DraggablePlayground',
    components: {
        DraggableV2,
        // DraggableV3,
        DraggableV4
    },
    data: () => ({
        active: 0,
        items: [
            { name: 'Alice'.repeat(5) },
            { name: 'Bob' },
            { name: 'Candy' },
            { name: 'Dandy' },
            { name: 'Elsa' },
            { name: 'Frank' },
            { name: 'Groovy' },
            { name: 'HHHH' },
            { name: 'IIIII' },
            { name: 'JJJJJ' },
            { name: 'KKKKK' },
            { name: 'LLLLL' },
            { name: 'MMMMM' },
        ],
        order: []
    }),
    computed: {
        itemStyle () {
            return {
                height: '96px',
                background: 'rgb(166,183,248)',
                border: 'red 1px solid'
                // width: '150px'
            }
        }
    },
    methods: {
        vibrate () {
            try {
                if (window.navigator.vibrate instanceof Function) {
                    const result = window.navigator.vibrate(100)
                    this.$snackbar.success('success ' + result)
                }
            } catch (e) {
                this.$snackbar.error(e.toString())
            }
        },
        onMove (...args) {
            // console.log(...args)
        },
        log (...args) {
            console.log(...args)
        }
    }
}
</script>

<style scoped>

</style>

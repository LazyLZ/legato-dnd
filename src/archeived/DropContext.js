import { EventEmitter } from 'eventemitter3'
import { DragDrop } from './DragDropV2'
import { CONTEXT_CLASS } from './const'

export class DropContext extends EventEmitter {
    el
    containerSet = new Set()

    constructor ({ el, containers }) {
        super()
        this.el = el
        if (Array.isArray(containers)) {
            this.addContainer(...containers)
        }
    }

    addContainer (...list) {
        list.forEach(c => {
            if (c instanceof DragDrop) {
                this.containerSet.add(c)
            }
        })
        console.log('addListener', this.containerSet)
    }

    removeContainer (...list) {
        list.forEach(c => {
            this.containerSet.delete(c)
        })
    }

}

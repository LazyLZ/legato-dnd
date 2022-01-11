import { elementIsWindow } from './helper.js'

export class ScrollState {
    scrollOffset = NaN
    scrollSize = NaN
    clientSize = NaN
    el

    constructor ({ el, orientation = '' }) {
        this.orientation = orientation.toUpperCase()
        this.el = el
        if (!this.el) return

        let scrollOffset, clientSize, scrollSize
        if (elementIsWindow(el)) {
            if (this.orientation === 'X') {
                scrollOffset = window.scrollX
                clientSize = window.innerWidth
                scrollSize = document.documentElement.scrollWidth
            }
            else {
                scrollOffset = window.scrollY
                clientSize = window.innerHeight
                scrollSize = document.documentElement.scrollHeight
            }
        }
        else {
            if (this.orientation === 'X') {
                scrollOffset = el.scrollLeft
                clientSize = el.clientWidth
                scrollSize = el.scrollWidth
            }
            else {
                scrollOffset = el.scrollTop
                clientSize = el.clientHeight
                scrollSize = el.scrollHeight
            }
        }
        this.scrollSize = scrollSize
        this.scrollOffset = scrollOffset
        this.clientSize = clientSize
    }

    isToEnd (direction) {
        if ([this.scrollOffset, this.clientSize, this.scrollSize].some(isNaN)) return true
        let isEnd = true
        if (direction === 1) {
            isEnd = this.scrollOffset + this.clientSize >= this.scrollSize
        }
        if (direction === -1) {
            isEnd = this.scrollOffset === 0
        }
        return isEnd
    }
    get isNone () {
        return !!this.el
    }

    equal (state) {
        if (this.isNone && state.isNone) return true
        if (this.isNone !== state.isNone) return false
        return this.el === state.el &&
           this.orientation === state.orientation
    }
}

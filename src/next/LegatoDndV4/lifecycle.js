import { elementIsScrollable } from './helper.js'
import { EventEmitter } from 'eventemitter3'
import { Model } from './model'
import { Layout } from './layout'

class Lifecycle extends EventEmitter {
    static INACTIVE = 0
    static DRAG_START_ACTIVE = 1
    static DRAGGING = 2
    static DROP_ACTIVE = 3
    static CANCEL_REASON = {
        EXCEED_OFFSET_LIMIT: 1,
        END_BEFORE_DELAY: 2,
        NOT_DRAGGABLE_ELEMENT: 3
    }

    // state
    _status
    container
    items
    viewports
    orientation
    layout
    model

    // props
    startDelay
    touchStartDelay

    constructor ({ orientation, startDelay = 0, touchStartDelay = 0, ...props }) {
        super()
        this.orientation = orientation
        this.startDelay = startDelay
        this.touchStartDelay = touchStartDelay

        this.model = new Model(props)
        this.layout = new Layout(props)
    }

    get isDragInactive () {
        return this._status === Lifecycle.INACTIVE
    }

    get isDragStartActive () {
        return this._status === Lifecycle.DRAG_START_ACTIVE
    }

    get isDragging () {
        return this._status === Lifecycle.DRAGGING
    }

    get isDragStarted () {
        return this._status >= Lifecycle.DRAGGING
    }

    mount (container) {
        if (!(container instanceof HTMLElement)) {
            throw TypeError('Container need to be HTMLElement')
        }
        this.container = container
        this.bindMouseDragStartListeners()
        this.bindTouchDragStartListeners()
    }

    updateItems () {
        this.items = [...this.container.children]
    }

    updateViewports () {
        let list = []
        let el = this.container
        while (el.parentElement) {
            el = el.parentElement
            const { isScrollable, style } = elementIsScrollable(el, this.orientation)

            if (isScrollable) {
                list.push(el)
            }
            if (style.position === 'fixed') {
                break
            }
        }
        this.viewports = list
    }

    // TODO 代码整理优化
    // Fixme 考虑如何禁止某些element的拖拽
    bindMouseDragStartListeners () {
        this.container.addEventListener('mousedown', e => {
            if (+e.button !== 0) return
            // console.log('mousedown event', this._status, this.isDragStarted, this.isDragStartActive)
            if (this.isDragStarted || this.isDragStartActive) return
            const payload = {
                clientX: e.clientX,
                clientY: e.clientY,
                event: e
            }
            if (this.startDelay) {
                this.delayMouseDragStart(payload)
            }
            else {
                e.preventDefault()
                e.stopPropagation()
                this.bindMouseLifecycleListeners()
                this.bindEnvironmentListeners()
                // start
                this.dragStart(payload)
            }
        })
    }

    bindEnvironmentListeners () {
        // scroll
        const scroll = e => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.moveContainer(e)
            })
        }

        const scrollTargets = this.viewports.map(el => {
            return el === document.documentElement ? window : el
        })

        // resize
        // Fixme 未实现
        const resize = e => {
            window.requestAnimationFrame(() => {
                if (!this.isDragStarted) return
                this.resizeContainer()
            })
        }
        scrollTargets.forEach(t => {
            t.addEventListener('scroll', scroll, { passive: true })
        })

        window.addEventListener('resize', resize, { passive: true })

        this.once('dragEnd', () => {
            window.removeEventListener('resize', resize)
            scrollTargets.forEach(t => {
                t.removeEventListener('scroll', scroll)
            })
        })
    }

    delayMouseDragStart ({ clientX, clientY, event }) {
        let endX = clientX
        let endY = clientY
        let pid
        let startRect = this.container.getBoundingClientRect()
        let endRect = startRect
        const tolerate = this.startOffsetTolerate
        const events = [
            { target: window, type: 'mousemove' },
            { target: window, type: 'resize' },
            ...this.viewports.map(s => ({ target: s, type: 'scroll' }))
        ]
        const onMove = e => {
            window.requestAnimationFrame(() => {
                if (e instanceof MouseEvent) {
                    endX = e.clientX
                    endY = e.clientY
                }
                else {
                    endRect = this.container.getBoundingClientRect()
                }
                const dX = endX - clientX + startRect.left - endRect.left
                const dY = endY - clientY + startRect.top - endRect.top
                if (
                    Math.abs(dX) > tolerate || Math.abs(dY) > tolerate
                ) {
                    window.removeEventListener('mouseup', mouseup)
                    events.forEach(({ target, type }) => {
                        target.removeEventListener(type, onMove)
                    })
                    clearTimeout(pid)
                    this.dragCanceled({
                        clientX, clientY, event,
                        type: Lifecycle.CANCEL_REASON.EXCEED_OFFSET_LIMIT
                    })
                    // console.log('move exceed limit')
                }
            })
        }
        const mouseup = () => {
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            clearTimeout(pid)
            this.dragCanceled({
                clientX, clientY, event,
                type: Lifecycle.CANCEL_REASON.END_BEFORE_DELAY
            })
            // console.log('mouseup before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('mouseup', mouseup)
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            this.blurActiveElement()
            this.bindMouseLifecycleListeners()
            this.dragStart({ clientX: endX, clientY: endY, event })
        }, this.startDelay)

        // console.log('start count')
        this.pressStart({ clientX, clientY, event })
        events.forEach(({ target, type }) => {
            target.addEventListener(type, onMove, { passive: true })
        })
        window.addEventListener('mouseup', mouseup, { once: true })
    }

    bindMouseLifecycleListeners () {
        // dragover
        const dragOver = e => {
            // trigger by touch
            if (!e.movementX && !e.movementY) return
            window.requestAnimationFrame(() => {
                if (!this.isDragging) return
                this.moveTarget(e)
            })
        }
        window.addEventListener('mousemove', dragOver, { passive: true })

        // drop
        window.addEventListener('mouseup', e => {
            e.preventDefault()
            e.stopPropagation()
            window.removeEventListener('mousemove', dragOver)
            this.drop(e)
        }, { once: true })
    }

    bindTouchDragStartListeners () {
        this.container.addEventListener('touchstart', e => {
            // console.log('touchstart event', e, index)
            if (this.isDragStarted || this.isDragStartActive) return
            const rect = this.container.getBoundingClientRect()
            const touch = [...e.touches].find(t => {
                const { clientX: x, clientY: y } = t
                return x >= rect.left && x <= rect.right &&
                    y >= rect.top && y <= rect.bottom
            })
            if (!touch) return

            const payload = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                event: e,
                touchId: touch.identifier
            }
            if (this.startDelay || this.touchStartDelay) {
                this.delayTouchDragStart(payload)
            }
            else {
                if (e.cancelable) e.preventDefault()
                e.stopPropagation()
                this.bindTouchLifecycleListeners(touch.identifier)
                // start
                this.dragStart(payload)
            }
        })
    }

    delayTouchDragStart ({ clientX, clientY, event, touchId }) {
        const delayMs = this.touchStartDelay || this.startDelay
        let endX = clientX
        let endY = clientY
        let pid
        let startRect = this.container.getBoundingClientRect()
        let endRect = startRect
        const tolerate = this.startOffsetTolerate
        const events = [
            { target: window, type: 'touchmove' },
            { target: window, type: 'resize' },
            ...this.viewports.map(s => ({ target: s, type: 'scroll' }))
        ]

        const onMove = e => {
            window.requestAnimationFrame(() => {
                if (e instanceof TouchEvent) {
                    const touch = [...e.touches].find(t => t.identifier === touchId)
                    if (!touch) return
                    endX = touch.clientX
                    endY = touch.clientY
                }
                else {
                    endRect = this.container.getBoundingClientRect()
                }
                const dX = endX - clientX + startRect.left - endRect.left
                const dY = endY - clientY + startRect.top - endRect.top
                if (
                    Math.abs(dX) > tolerate || Math.abs(dY) > tolerate
                ) {
                    window.removeEventListener('touchend', touchend)
                    events.forEach(({ target, type }) => {
                        target.removeEventListener(type, onMove)
                    })
                    clearTimeout(pid)
                    this.dragCanceled({
                        clientX, clientY, event,
                        type: Lifecycle.CANCEL_REASON.EXCEED_OFFSET_LIMIT
                    })
                    // console.log('move exceed limit')
                }
            })
        }
        const touchend = e => {
            if (e.cancelable) {
                e.preventDefault()
            }
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            clearTimeout(pid)
            this.dragCanceled({
                clientX, clientY, event,
                type: Lifecycle.CANCEL_REASON.END_BEFORE_DELAY
            })
            // console.log('touched before delay')
        }

        pid = setTimeout(() => {
            window.removeEventListener('touchend', touchend)
            events.forEach(({ target, type }) => {
                target.removeEventListener(type, onMove)
            })
            this.bindTouchLifecycleListeners(touchId)
            this.dragStart({ clientX: endX, clientY: endY, event })
        }, delayMs)
        // console.log('start count')
        this.pressStart({ clientX, clientY, event })
        events.forEach(({ target, type }) => {
            target.addEventListener(type, onMove, { passive: true })
        })
        window.addEventListener('touchend', touchend, { once: true })
    }

    bindTouchLifecycleListeners (touchId) {
        // dragover
        const dragOver = e => {
            if (!this.isDragging) return
            if (e.cancelable) {
                e.preventDefault()
            }
            const touch = [...e.touches].find(t => t.identifier === touchId)
            if (touch) {
                // console.log('touchmove', touch)
                // console.log('dragover', touch.clientX, touch.clientY)
                window.requestAnimationFrame(() => {
                    if (!this.isDragging) return
                    this.moveTarget(e)
                })
            }
        }
        window.addEventListener('touchmove', dragOver, { passive: false })

        // drop
        const touchend = e => {
            if (e.cancelable) {
                e.preventDefault()
            }
            e.stopPropagation()
            window.removeEventListener('touchmove', dragOver)
            const touch = [...e.changedTouches].find(t => t.identifier === touchId)
            // console.log('touchend', e)
            if (touch) {
                this.drop(touch)
                window.removeEventListener('touchend', touchend)
            }
        }
        window.addEventListener('touchend', touchend)
    }

    updateStatus (status) {
        this._status = status
    }

    pressStart (payload) {
        this.updateItems()
        this.updateViewports()
        this.updateStatus(Lifecycle.DRAG_START_ACTIVE)
        this.emit('pressStart', payload)
    }

    dragCanceled () {
        if (!this.isDragStartActive) return
        this.updateStatus(Lifecycle.INACTIVE)
        this.items = []
        this.viewports = []
    }

    dragStart ({ clientY, clientX }) {
        const { container, viewports, items, model } = this
        this.model.setItems(items.map(el => el.getBoundingClientRect()))
        this.model.setViewports(viewports.map(el => el.getBoundingClientRect()))
        this.model.start({ clientY, clientX, containerRect: this.container.getBoundingClientRect() })
        this.layout.onDragStart({ items, model })
        this.updateStatus(Lifecycle.DRAGGING)
        this.emit('dragStart', {
            index: this.model.startIndex
        })

        this.model.on('move', () => {
            this.layout.onDragMove({ items, model })
        })
        this.model.on('cross', () => {
            this.layout.onDragCross({ items, container })
        })
        this.model.on('end', () => {
            this.layout.onDragEnd({ items, container })
        })

    }

    moveTarget ({ clientX, clientY }) {
        this.model.move({ clientX, clientY })
    }

    moveContainer () {
        this.model.move({ containerRect: this.container.getBoundingClientRect() })
    }

    resizeContainer () {
        // Fixme 未实现
        this.model.move({ containerRect: this.container.getBoundingClientRect() })
    }

    drop () {
        const { container, viewports, items, model } = this
        this.layout.onDrop({ items, model })
        setTimeout(() => {

        })
    }
}

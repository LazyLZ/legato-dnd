import throttle from 'lodash/throttle'
import debounce from 'lodash/debounce'
import { EventEmitter } from 'events'

export const CONTAINER_CLASS = '__container__'
export const DRAGGABLE_CLASS = '__draggable__'
export const PLACEHOLDER_CLASS = '__placeholder__'
// const DRAGGING_START_EL_CLASS = '__dragging-start-el__'
// const DRAGGING_OTHER_EL_CLASS = '__dragging-start-el__'
// const DRAGEND_ACTIVE_START_EL_CLASS = '__dragend-active-start-el__'
// const DRAGEND_ACTIVE_OTHER_EL_CLASS = '__dragend-active-other-el__'
// TODO 支持定死边界
// Fixme 部分变量小数 -> 整数
// TODO 支持出边界后删除节点
// Fixme 拖拽时滚动会导致boundingClientRect改变，导致计算错误
// Fixme 外部设置overflow但没设置高度，拖拽时导致滚动，导致页面闪动
export class BaseEngine extends EventEmitter {
    static INACTIVE = 0
    static DRAG_START_ACTIVE = 1
    static DRAGGING = 2
    static DRAG_END_ACTIVE = 3

    container

    orderedBoxes
    innerOrder

    // props
    vertical
    throttleMs
    transitionDuration

    // drag state
    containerRect_ = null
    scrollableParentRect_ = null
    scrollableParentElement_ = null

    startIndex = null
    startClientX = null
    startClientY = null
    startScrollX = null
    startScrollY = null
    startRect = null

    currentIndex = null
    currentClientX = null
    currentClientY = null
    currentScrollX = null
    currentScrollY = null
    currentToEdgeValue = null
    currentToEdgeDirection = null

    // placeholder function
    getPlaceholder = null

    // moveToIndex = null
    dragendDistance = null

    placeholder = null

    // handlers
    dragoverHandler = null
    scrollHandler = null

    // drag status
    dragStatus = BaseEngine.INACTIVE

    // throttle/debounce function
    throttleOnDragover
    debounceOnResize

    // scroll
    scrollTimer
    // scrollMs = 100
    scrollSizeFunction = null
    scrollStartPosition = null
    scrollStartTimestamp = null
    scrollEdgeThreshold = -10

    constructor ({ container, vertical = false, throttleMs = 0, transitionDuration = 200 }) {
        super()
        if (!(container instanceof HTMLElement)) {
            throw TypeError('Container need to be HTMLElement')
        }

        this.container = container

        this.vertical = vertical
        this.throttleMs = throttleMs
        this.transitionDuration = transitionDuration

        this.container.classList.add(CONTAINER_CLASS)

        this.throttleOnDragover = throttle(function ({ clientX, clientY, scrollLeft, scrollTop }) {
            this.onDragover({ clientX, clientY, scrollLeft, scrollTop })
        }, throttleMs, { trailing: false })

        this.debounceOnResize = debounce(function () {
            this.onResize()
        }, 100)

        this.scrollSizeFunction = (offset, time, edge, direction) => {
            const alpha = 3
            const [a1, b1, a2, b2] = [-20, 1, -100, 3]
            const k = (b1 - b2) / (a1 - a2)
            const b = b1 - k * a1
            let beta
            if (edge > a1) {
                beta = b1
            } else if (edge < a2) {
                beta = b2
            } else {
                beta = k * edge + b
            }
            // console.log('calculate', time, alpha, beta, direction)
            return alpha * beta * direction
        }

        this.getPlaceholder = () => {
            return document.createElement('div')
        }

        this.registerDragstartEvents()

        // set style
        this.setContainerStyle()
        this.children.filter(this.isDraggable).forEach(this.setDraggableStyle)
        this.children.forEach(this.setCommonStyle)
    }

    get children () {
        return Array.from(this.container.children).filter(el => !this.isPlaceholder(el))
    }

    get isDragging () {
        return this.dragStatus === BaseEngine.DRAGGING
    }

    get isDragendActive () {
        return this.dragStatus === BaseEngine.DRAG_END_ACTIVE
    }

    get isDragInactive () {
        return this.dragStatus === BaseEngine.INACTIVE
    }

    isDraggable (el) {
        return el.classList.contains(DRAGGABLE_CLASS)
    }

    isPlaceholder (el) {
        return el.classList.contains(PLACEHOLDER_CLASS)
    }

    getMainAxisSize ({ x, y }) {
        return this.vertical ? y : x
    }

    getCrossAxisSize ({ x, y }) {
        return this.vertical ? x : y
    }

    getMainAxisDistance (p1, p2) {
        return this.getMainAxisSize(p1) - this.getMainAxisSize(p2)
    }

    getCrossAxisDistance (p1, p2) {
        return this.getCrossAxisSize(p1) - this.getCrossAxisSize(p2)
    }

    findScrollableParent () {
        let el = this.container
        // Fixme 分开处理
        while (el) {
            el = el.parentElement
            const scrollSize = this.getMainAxisSize({ x: el.scrollWidth, y: el.scrollHeight })
            const clientSize = el === document.body
                ? this.getMainAxisSize({ x: window.innerWidth, y: window.innerHeight })
                : this.getMainAxisSize({ x: el.clientWidth, y: el.clientHeight })
            const style = window.getComputedStyle(el)
            const overflow = this.vertical ? style.overflowY : style.overflowX
            const scrollable = overflow === 'scroll' || overflow === 'auto'
            if (scrollSize > clientSize && scrollable) {
                // console.log('compare', scrollSize, clientSize, style.overflow)
                break
            }
            if (el === document.body) {
                // console.log(scrollable, scrollSize, clientSize)
                break
            }
        }
        this.scrollableParentElement_ = el

        // console.log('scrollable parent', el)
        if (el === document.body) {
            this.scrollableParentRect_ = {
                top: 0,
                left: 0,
                right: window.innerWidth,
                bottom: window.innerHeight,
                width: window.innerWidth,
                height: window.innerHeight
            }
        } else {
            this.scrollableParentRect_ = el.getBoundingClientRect()
        }
    }

    refreshBoundary () {
        const el = this.scrollableParentElement_

        // console.log('scrollable parent', el)
        if (el === document.body) {
            this.scrollableParentRect_ = {
                top: 0,
                left: 0,
                right: window.innerWidth,
                bottom: window.innerHeight,
                width: window.innerWidth,
                height: window.innerHeight
            }
        } else if (el) {
            this.scrollableParentRect_ = el.getBoundingClientRect()
        }

        this.containerRect_ = this.container.getBoundingClientRect()
    }

    // Fixme 滚动会改变
    getContainerRect () {
        if (!this.containerRect_) {
            this.refreshBoundary()
        }
        return this.containerRect_
    }

    getScrollableParentRect () {
        if (!this.containerRect_) {
            this.refreshBoundary()
        }
        return this.scrollableParentRect_
    }

    getScrollableParentScrollState () {
        if (!this.containerRect_) {
            this.refreshBoundary()
        }
        const el = this.scrollableParentElement_
        return el
            ? { scrollTop: el.scrollTop, scrollLeft: el.scrollLeft }
            : { scrollTop: 0, scrollLeft: 0 }
    }

    getScrollableParentElement () {
        if (!this.containerRect_) {
            this.refreshBoundary()
        }
        return this.scrollableParentElement_
    }

    initOrder () {
        this.innerOrder = this.children.map((c, i) => i)
    }

    computeBoxes () {
        // get boxes
        const boxes = this.children.map((el, index) => ({
            width: el.offsetWidth,
            height: el.offsetHeight,
            index
        }))
        // ordered
        this.orderedBoxes = boxes.map((box, i) => boxes[this.innerOrder[i]])
    }

    registerDragstartEvents () {
        this.container.addEventListener('mousedown', e => {
            console.log('dragstart event', e)
            if (+e.button !== 0) return
            e.preventDefault()
            e.stopPropagation()
            if (
                document.activeElement &&
                document.activeElement.tagName.toLowerCase() !== 'body'
            ) {
                document.activeElement.blur()
            }

            this.onDragstart({ clientX: e.clientX, clientY: e.clientY })
        })
    }

    registerDragoverEvents () {
        if (!this.dragoverHandler) {
            this.dragoverHandler = e => {
                if (!this.isDragging) return
                // trigger by touch
                if (!e.movementX && !e.movementY) return
                if (typeof this.throttleMs === 'number' && this.throttleMs > 0) {
                    const { clientX, clientY } = e
                    const { scrollLeft, scrollTop } = this.getScrollableParentScrollState()
                    this.throttleOnDragover({ clientX, clientY, scrollLeft, scrollTop })
                } else {
                    const { clientX, clientY } = e
                    const { scrollLeft, scrollTop } = this.getScrollableParentScrollState()
                    window.requestAnimationFrame(() => {
                        this.onDragover({ clientX, clientY, scrollLeft, scrollTop })
                    })
                }
            }
            window.addEventListener('mousemove', this.dragoverHandler, { passive: true })
        }
    }

    registerResizeEvents () {
        if (!this.resizeHandler) {
            this.resizeHandler = e => {
                this.onResize(e)
            }
            window.addEventListener('scroll', this.resizeHandler)
        }
    }

    removeResizeEvents () {
        if (this.resizeHandler) {
            window.removeEventListener('scroll', this.resizeHandler)
            this.resizeHandler = null
        }
    }

    registerScrollEvents () {
        if (!this.scrollHandler) {
            this.scrollHandler = e => {
                if (this.isDragInactive) return
                window.requestAnimationFrame(() => {
                    this.onScroll(e)
                })
            }
            const el = this.getScrollableParentElement()
            if (el) {
                el.addEventListener('scroll', this.scrollHandler)
            } else {
                window.addEventListener('scroll', this.scrollHandler)
            }
        }
    }

    removeScrollEvents () {
        if (this.scrollHandler) {
            const el = this.getScrollableParentElement()
            if (el) {
                el.removeEventListener('scroll', this.scrollHandler)
            } else {
                window.removeEventListener('scroll', this.scrollHandler)
            }
            this.scrollHandler = null
        }
    }

    removeDragoverEvents () {
        if (this.dragoverHandler) {
            window.removeEventListener('mousemove', this.dragoverHandler)
            this.dragoverHandler = null
        }
    }

    registerDragendEvents () {
        window.addEventListener('mouseup', e => {
            e.preventDefault()
            e.stopPropagation()
            const { clientX, clientY } = e
            const { scrollLeft, scrollTop } = this.getScrollableParentScrollState()
            this.onDragend({ clientX, clientY, scrollLeft, scrollTop })
        }, { once: true })
    }

    getStartIndex ({ clientX, clientY }) {
        const rect = this.getContainerRect()
        const offset = this.getMainAxisDistance(
            { x: clientX, y: clientY },
            { x: rect.left, y: rect.top }
        )
        // console.log('offset', offset)
        let i = 0
        let total = 0
        for (let box of this.orderedBoxes) {
            total += this.getMainAxisSize({ x: box.width, y: box.height })
            if (offset < total) {
                break
            } else {
                i += 1
            }
        }

        // console.log(offset, i)
        return i
    }

    clearDragState () {
        this.containerRect_ = null
        this.scrollableParentRect_ = null
        this.scrollableParentElement_ = null
        this.startIndex = null
        this.startClientX = null
        this.startClientY = null
        this.startScrollX = null
        this.startScrollY = null

        this.currentIndex = null
        this.currentClientX = null
        this.currentClientY = null
        this.currentScrollX = null
        this.currentScrollY = null
        this.currentToEdgeValue = null
        this.currentToEdgeDirection = null

        this.dragendDistance = null
    }

    onDragstart ({ clientX, clientY }) {
        console.log('dragstart', this.dragStatus)
        if (!this.isDragInactive) return
        this.findScrollableParent()
        this.refreshBoundary()
        this.initOrder()
        this.computeBoxes()
        this.registerDragoverEvents()
        this.registerDragendEvents()
        this.registerScrollEvents()
        this.registerResizeEvents()
        const { scrollLeft, scrollTop } = this.getScrollableParentScrollState()
        // Fixme 用闭包直接确定index
        const index = this.getStartIndex({ clientX, clientY })

        if (index == null) return
        const el = this.children[index]

        if (!el || !this.isDraggable(el)) return

        this.dragStatus = BaseEngine.DRAGGING
        this.startClientX = clientX
        this.startClientY = clientY
        this.startIndex = index
        this.currentIndex = index
        this.startRect = el.getBoundingClientRect()
        const placeholder = this.getPlaceholder()
        this.placeholder = placeholder
        // console.log('append', this.startRect.height + 'px')
        placeholder.style.height = this.startRect.height + 'px'
        placeholder.style.width = this.startRect.width + 'px'
        placeholder.style.backgroundColor = 'red'
        placeholder.classList.add(PLACEHOLDER_CLASS)
        this.setIndexStableStyle()
        el.after(placeholder)

        this.startScrollX = scrollLeft
        this.startScrollY = scrollTop

        // this.moveToIndex = this.startIndex
    }

    // getDragDistance () {
    //     const [sX, sY, cX, cY] = [
    //         this.startClientX,
    //         this.startClientY,
    //         this.currentClientX,
    //         this.currentClientY
    //     ]
    //
    //     // displacement
    //     return this.getMainAxisDistance({ x: cX, y: cY }, { x: sX, y: sY })
    // }

    getHasMovedSize (start, to) {
        return this.orderedBoxes
            .filter((box, i) => {
                return (i > start && i <= to) || (i < start && i >= to)
            })
            .reduce((t, box) => t + this.getMainAxisSize({ x: box.width, y: box.height }), 0)
    }

    // Fixme 当container完全被parent包裹，且parent有滚动时，此时元素溢出不应该滚动
    getToEdgeState ({ clientX, clientY }) {
        this.refreshBoundary()
        const parentRect = this.getScrollableParentRect()
        const containerRect = this.getContainerRect()
        const [sX, sY] = [
            this.startClientX,
            this.startClientY
        ]
        const { top: sTop, left: sLeft, right: sRight, bottom: sBottom } = this.startRect
        if (!parentRect) return { value: NaN, direction: 0 }
        const containerMargin = this.getMainAxisSize({ x: containerRect.left, y: containerRect.top })
        const parentMargin = this.getMainAxisSize({ x: parentRect.left, y: parentRect.top })
        const containerSize = this.getMainAxisSize({ x: containerRect.width, y: containerRect.height })
        const parentSize = this.getMainAxisSize({ x: parentRect.width, y: parentRect.height })

        const positivePoint = this.getMainAxisSize({ x: sRight + clientX - sX, y: sBottom + clientY - sY })
        const negativePoint = this.getMainAxisSize({ x: sLeft + clientX - sX, y: sTop + clientY - sY })
        const positive = parentMargin + parentSize - positivePoint
        const negative = negativePoint - parentMargin

        let value
        let direction
        if (positive > negative) {
            value = containerMargin >= parentMargin ? NaN : negative
            direction = -1
        } else {
            value = containerMargin + containerSize <= parentMargin + parentSize ? NaN : positive
            direction = 1
        }
        // console.log('positive edge', containerMargin >= parentMargin, positive, value)
        // console.log('negative edge', containerMargin + containerSize <= parentMargin + parentSize, negative, value)
        if (value > this.scrollEdgeThreshold) {
            value = NaN
        }
        return { value, direction }
    }

    get isScrollToEnd () {
        const parent = this.getScrollableParentElement()
        const direction = this.currentToEdgeDirection
        if (!parent || !direction) return true
        let { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = parent
        if (parent === document.body) {
            scrollTop = window.scrollY
            scrollLeft = window.scrollX
            clientWidth = window.innerWidth
            clientHeight = window.innerHeight
        }
        const scrollOffset = this.getMainAxisSize({ x: scrollLeft, y: scrollTop })
        const scrollSize = this.getMainAxisSize({ x: scrollWidth, y: scrollHeight })
        const clientSize = this.getMainAxisSize({ x: clientWidth, y: clientHeight })
        let isScrollToEnd
        // console.log('scroll end', scrollOffset, clientSize, scrollSize)
        if (direction > 0) {
            isScrollToEnd = Math.round(scrollOffset + clientSize) >= Math.round(scrollSize)
        } else {
            isScrollToEnd = Math.round(scrollOffset) === 0
        }
        return isScrollToEnd
    }

    startScroll () {
        const parent = this.getScrollableParentElement()
        if (!parent) return
        console.log('scroll start')
        this.scrollTimer = true
        this.scrollStartTimestamp = Date.now()
        this.scrollStartPosition = parent === document.body
            ? this.getMainAxisSize({ x: window.scrollX, y: window.scrollY })
            : this.getMainAxisSize({ x: parent.scrollLeft, y: parent.scrollTop })

        const handler = () => {
            if (!this.scrollTimer) return
            const toEdgeValue = this.currentToEdgeValue
            const direction = this.currentToEdgeDirection
            if (isNaN(toEdgeValue) || !direction) {
                this.stopScroll()
                return
            }

            const timestamp = Date.now()
            const timeDelta = timestamp - this.scrollStartTimestamp
            const startPosition = this.scrollStartPosition
            const target = parent === document.body ? window : parent
            let { scrollLeft, scrollTop, scrollWidth, scrollHeight } = parent
            if (parent === document.body) {
                scrollTop = window.scrollY
                scrollLeft = window.scrollX
                // clientWidth = window.innerWidth
                // clientHeight = window.innerHeight
            }
            const scrollSize = this.getMainAxisSize({ x: scrollWidth, y: scrollHeight })

            const scrollOffset = this.getMainAxisSize({ x: scrollLeft, y: scrollTop })
            const scrollDelta = this.scrollSizeFunction(scrollOffset, timeDelta, toEdgeValue, direction)
            if (isNaN(scrollDelta)) {
                this.stopScroll()
                throw new Error('scrollDelta cannot be NaN')
            }

            // const clientSize = this.getMainAxisSize({ x: clientWidth, y: clientHeight })
            let isScrollToEnd = this.isScrollToEnd
            // console.log('scroll to end', scrollOffset, clientSize, scrollSize)
            if (!isScrollToEnd) {
                if (this.vertical) {
                    const value = Math.ceil(Math.min(scrollOffset + scrollDelta, scrollSize))
                    target.scrollTo(scrollLeft, value)
                } else {
                    const value = Math.ceil(Math.min(scrollOffset + scrollDelta, scrollSize))
                    target.scrollTo(value, scrollTop)
                }
                console.log('scroll', direction, startPosition, scrollDelta)
                window.requestAnimationFrame(handler)
            } else {
                console.log('scroll end')
                this.stopScroll()
            }
        }

        window.requestAnimationFrame(handler)
    }

    stopScroll () {
        this.scrollTimer = false
        this.scrollStartPosition = null
        this.scrollStartTimestamp = null
    }

    getCurrentIndex ({ clientX, clientY, scrollLeft, scrollTop }) {
        const d = this.getMainAxisDistance(
            { x: clientX + scrollLeft, y: clientY + scrollTop },
            { x: this.startClientX + this.startScrollX, y: this.startClientY + this.startScrollY }
        )

        const boxes = this.orderedBoxes
        const absD = Math.abs(d)
        let p = this.startIndex
        let sum = 0

        /* eslint-disable */
        while ((d > 0 && p < boxes.length - 1) || (d < 0 && p > 0)) {
            const nextBox = boxes[d > 0 ? p + 1 : p - 1]
            const size = this.getMainAxisSize({ x: nextBox.width, y: nextBox.height })
            const threshold = size * 0.5
            if (sum + size < absD) {
                sum += size
                p += d > 0 ? 1 : -1
                continue
            }
            if (sum + threshold <= absD) {
                p += d > 0 ? 1 : -1
                break
            }
            break
        }

        // must valid (0 <= p <= length)
        return p
    }


    onScroll (e) {
        const { scrollTop, scrollLeft } = e.target
        const [clientX, clientY] = [this.currentClientX, this.currentClientY]
        this.onDragover({ clientX, clientY, scrollLeft, scrollTop })
    }

    onResize () {
        if (!this.isDragInactive) {
            this.refreshBoundary()
        }
    }

    // Fixme use requestAnimationFrame
    onDragover ({ clientX, clientY, scrollLeft, scrollTop }) {
        if (!this.isDragging) return
        const index = this.getCurrentIndex({ clientX, clientY, scrollLeft, scrollTop })

        const { value: edge, direction } = this.getToEdgeState({ clientX, clientY })
        this.currentToEdgeValue = edge
        this.currentToEdgeDirection = direction
        if (!isNaN(edge) && !this.scrollTimer && !this.isScrollToEnd) {
            this.startScroll()
        }

        this.currentClientX = clientX
        this.currentClientY = clientY
        this.currentScrollX = scrollLeft
        this.currentScrollY = scrollTop

        const oldIndex = this.currentIndex
        this.currentIndex = index
        // console.log('dragover', index)
        if (oldIndex !== index) {
            this.setIndexStableStyle()
        }
        this.setDynamicStyle()
    }

    setCommonStyle (el) {
        el.style.margin = '0 !important'
        el.style.overflow = 'hidden'
    }

    setDraggableStyle (el) {
        el.style.cursor = 'move'
    }

    setContainerStyle () {
        const style = this.container.style
        style.padding = '0 !important'
        style.border = '0 !important'
        style.display = 'flex'
        style.flexDirection = this.vertical ? 'column' : 'row'
        style.flexWrap = 'nowrap'
        style.overflow = 'visible'
    }

    // style changes only when the currentIndex change
    setIndexStableStyle () {
        this.children.forEach((el, i) => {
            let s = {}
            if (this.isDragInactive) {
                return
            }
            // (optional) dragging/dragend-active-start-el
            if (i === this.startIndex) {
                s.zIndex = 2
                s.position = 'fixed'
                const { top, left, height, width } = this.startRect
                s.top = top + 'px'
                s.left = left + 'px'
                s.height = height + 'px'
                s.width = width + 'px'
            }
            // dragging/dragend-active-other-el
            if (this.startIndex !== i) {
                s.zIndex = 1
                // Fixme 设置important导致duration失效
                s.transitionDuration = `${this.transitionDuration}ms`
                s.transitionTimingFunction = 'ease'
                s.transitionProperty = 'all'
                s.pointerEvents = 'none'
            }
            // dragend-active-start-el
            if (this.startIndex === i && this.isDragendActive) {
                s.transitionTimingFunction = 'ease'
                s.transitionProperty = 'all'
                s.transitionDuration = `${this.transitionDuration}ms`
            }
            // dragging-start-el
            if (this.startIndex === i && this.isDragging) {
                // s.transitionDuration = (this.throttleMs ? this.throttleMs : 10) + 'ms'
                s.transitionDuration = '0'
                s.transitionTimingFunction = ''
                s.transitionProperty = ''
            }
            Object.entries(s).forEach(([key, value]) => {
                el.style[key] = value
            })
        })
        const style = this.placeholder.style
        const direction = this.vertical ? 'Y' : 'X'
        const [start, to] = [this.startIndex, this.currentIndex]
        const hasMoved = this.getHasMovedSize(start, to)
        const d = start < to ? 1 : -1
        // TODO 可配置
        style.transform = `translate${direction}(${d * hasMoved}px)`
        style.transitionTimingFunction = 'ease'
        style.zIndex = 0
        style.transitionProperty = 'all'
        const size = this.getMainAxisSize({ x: this.startRect.width, y: this.startRect.height })
        style.transitionDuration = `${this.getPlaceholderMs(size)}ms`
        // console.log('placeholder style', style)
    }

    getPlaceholderMs (size) {
        return size
    }

    // style changes with pointer(mouse)
    // Fixme 只有start是动态，其他全部是indexstable
    setDynamicStyle () {
        this.children.forEach((el, i) => {
            let s = {}
            if (this.isDragInactive) {
                return
            }
            const [start, to, cX, cY, sX, sY] = [
                this.startIndex,
                this.currentIndex,
                this.currentClientX,
                this.currentClientY,
                // this.currentScrollX,
                // this.currentScrollY,
                this.startClientX,
                this.startClientY
                // this.startScrollX,
                // this.startScrollY
            ]

            // dynamic style
            const direction = this.vertical ? 'Y' : 'X'

            let value
            if (i === start) {
                value = this.dragendDistance == null
                    ? this.getMainAxisDistance({ x: cX, y: cY }, { x: sX, y: sY })
                    : this.dragendDistance
            } else if ((i > start && i <= to) || (i >= to && i < start)) {
                const startBox = this.orderedBoxes[start]
                const startSize = this.getMainAxisSize({ x: startBox.width, y: startBox.height })
                value = start < to ? -startSize : startSize
            } else {
                value = 0
            }
            s.transform = `translate${direction}(${value}px)`

            Object.entries(s).forEach(([key, value]) => {
                el.style[key] = value
            })
        })
    }

    clearDragStyle () {
        let styles = [
            'zIndex',
            'transitionDuration',
            'transitionTimingFunction',
            'transitionProperty',
            'pointerEvents',
            'transform',
            'position',
            'top',
            'left',
            'width',
            'height'
        ]
        styles.forEach(key => {
            this.children.forEach(el => {
                el.style[key] = ''
            })
        })
    }

    computeDragendDistance ({ start, to, clientX, clientY, scrollTop, scrollLeft }) {
        // displacement
        const d = this.getMainAxisDistance(
            { x: clientX + scrollLeft, y: clientY + scrollTop },
            { x: this.startClientX + this.startScrollX, y: this.startClientY + this.startScrollY }
        )

        const hasMoved = this.getHasMovedSize(start, to)
        const scrollDelta = this.getMainAxisDistance(
            { x: scrollLeft, y: scrollTop },
            { x: this.startScrollX, y: this.startScrollY }
        )
        // console.log('compute drag distance', hasMoved, scrollDelta)
        this.dragendDistance = (hasMoved - Math.abs(scrollDelta)) * (d > 0 ? 1 : -1)
    }

    onDragend ({ clientX, clientY, scrollLeft, scrollTop }) {
        if (this.isDragInactive) return
        this.dragStatus = BaseEngine.DRAG_END_ACTIVE
        this.currentIndex = this.getCurrentIndex({ clientX, clientY, scrollLeft, scrollTop })
        const { value: edge, direction } = this.getToEdgeState({ clientX, clientY })
        this.currentToEdgeValue = edge
        this.currentToEdgeDirection = direction
        this.stopScroll()
        this.currentClientX = clientX
        this.currentClientY = clientY
        this.currentScrollX = scrollLeft
        this.currentScrollY = scrollTop

        this.removeDragoverEvents()
        this.removeScrollEvents()
        this.removeResizeEvents()

        const [start, to] = [this.startIndex, this.currentIndex]
        this.computeDragendDistance({ start, to, clientX, clientY, scrollLeft, scrollTop })

        this.setDynamicStyle()
        this.setIndexStableStyle()
        // console.log('style', this.children[this.startIndex].style)
        console.log('dragend', clientY, clientX, this.dragendDistance)


        setTimeout(() => {
            this.clearDragState()
            this.clearDragStyle()
            if (this.placeholder) {
                this.container.removeChild(this.placeholder)
            }
            if (start !== to) {
                this.innerOrder = this.getMovedOrder(start, to)
                // console.log('new Order', newList)
                this.emit('move', {
                    from: start,
                    to: to,
                    order: [...this.innerOrder]
                })
            }
            this.dragStatus = BaseEngine.INACTIVE
        }, this.transitionDuration)
    }

    getMovedOrder (from, to) {
        const list = [...this.innerOrder]
        if (
            from !== to &&
            from >= 0 && from < list.length &&
            to >= 0 && to < list.length
        ) {
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

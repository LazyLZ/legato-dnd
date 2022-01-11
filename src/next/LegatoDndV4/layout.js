import { DRAGGABLE_CLASS, PLACEHOLDER_CLASS } from '../../archeived/const.js'
import { elementIsWindow } from './helper.js'
import { ScrollState } from './dom.js'
import { IntersectState } from './model.js'
import { EventEmitter } from 'eventemitter3'

// Fixme 能否停止时有缓冲，而不是硬着陆？
class Scroller extends EventEmitter {
    periods = []
    scrollDeltaFunction

    static defaultScrollDeltaFunction ({ state, startTime }) {
        return 5
        // const alpha = 3
        // const { value, direction } = state.itemIntersectState
        // const edge = value * direction
        // const [a1, b1, a2, b2] = [-20, 1, -100, 10]
        // const k = (b1 - b2) / (a1 - a2)
        // const b = b1 - k * a1
        // let beta
        // if (edge > a1) {
        //     beta = b1
        // }
        // else if (edge < a2) {
        //     beta = b2
        // }
        // else {
        //     beta = k * edge + b
        // }
        // // console.log('calculate', edge, alpha, beta, direction)
        // return alpha * beta * direction
    }

    constructor ({ scrollSpeed }) {
        super()
        this.scrollDeltaFunction = this.getScrollDeltaFunction(scrollSpeed)

    }

    // TODO 优化参数配置
    getScrollDeltaFunction (prop) {
        if (prop instanceof Function) return prop
        return Scroller.defaultScrollDeltaFunction
    }

    stop ({ el, orientation }) {
        const period = this.periods.find(p => p.state.el === el && p.state.orientation === orientation)
        // if (period) {
        //     console.log('stopScroll', period, state)
        // }
        // else {
        //     console.log('stopScroll error', state)
        // }

        if (period) {
            period.stopFlag = true
            this.emit('programmingScrollEnd', {
                startTime: period.startTime,
                endTime: Date.now(),
                endState: state, // Fixme 有可能是个全空的，此时要用上次的state
                startState: period.state
            })
            this.periods = this.periods.filter(p => p !== period)
        }
    }

    start ({ el, direction, orientation }) {
        const startState = new ScrollState({ el, orientation })
        if (!startState.isToEnd(direction)) return
        if (this.periods.some(p => p.state.el === el && p.state.orientation === orientation)) return

        const startTime = Date.now()
        const period = {
            startTime,
            stopFlag: false,
            state: startState
        }
        this.periods.push(period)
        this.emit('scrollStart', {
            startTime,
            state: startState
        })
        const scroll = () => {
            const state = new ScrollState({ el, orientation })
            if (period.stopFlag) return false
            if (state.isToEnd(direction)) {
                this.stop({ el, orientation })
                return false
            }
            const scrollDelta = this.scrollDeltaFunction({
                startTime,
                startState,
                state
            })
            // console.log('scroll', scrollDelta, state)
            if (isNaN(scrollDelta) || typeof scrollDelta !== 'number') {
                // console.log('scrollError', this.periods.find(p => p === period))
                // Fixme 容错机制，停止机制
                this.emit('scrollError', {
                    startTime,
                    state,
                    scrollDelta
                })
                this.stop({ el, orientation })
                return false
            }
            const target = elementIsWindow(el) ? window : el
            const newScrollOffset = Math.min(state.scrollOffset + scrollDelta, state.scrollSize)
            // console.log('scroll', newScrollOffset)
            if (state.orientation === 'X') {
                target.scrollTo({ left: newScrollOffset })
            }
            else {
                target.scrollTo({ top: newScrollOffset })
            }
            this.emit('scroll', {
                startTime,
                state
            })
            return true
        }

        const handler = () => {
            const next = scroll()
            if (next) {
                window.requestAnimationFrame(handler)
            }
        }
        window.requestAnimationFrame(handler)
    }

    clear () {
        // console.log('clear', this.periods)
        this.periods.forEach(p => {
            p.stopFlag = true
            this.emit('programmingScrollEnd', {
                startTime: p.startTime,
                endTime: Date.now(),
                endState: new ScrollState({ el: p.state.el, orientation: p.state.orientation }),
                startState: p.state
            })
        })
        this.periods = []
    }
}

export class Layout {
    // state
    placeholderElement
    scroller

    // props
    orientation
    transitionDuration
    // TODO 支持传入HTMLElements
    placeholder
    name
    inactiveClass
    startActiveClass
    dragActiveClass
    dropActiveClass
    scrollSpeed

    static defaultPlaceholder () {
        return document.createElement('div')
    }

    constructor (props) {
        if (props instanceof Object) {
            this.setProps(props)
        }
    }

    setProps ({
        orientation,
        transitionDuration = 200,
        placeholder = Layout.defaultPlaceholder,
        name = '',
        inactiveClass = '',
        startActiveClass = '',
        dragActiveClass = '',
        dropActiveClass = '',
        scrollSpeed
    }) {
        this.orientation = orientation
        this.transitionDuration = transitionDuration
        this.placeholder = placeholder
        this.name = name
        this.inactiveClass = inactiveClass
        this.startActiveClass = startActiveClass
        this.dragActiveClass = dragActiveClass
        this.dropActiveClass = dropActiveClass
        this.scroller = new Scroller({ scrollSpeed })
    }

    _mergeClassList (suffix, customList) {
        const defaultClass = `${this.name || 'l'}-${suffix}`
        customList = Array.isArray(customList) ? customList : customList.split(' ').filter(v => !!v)
        return [defaultClass, ...customList]
    }

    get dragInactiveClassList () {
        return this._mergeClassList('inactive', this.inactiveClass)
    }

    get startActiveClassList () {
        return this._mergeClassList('start-active', this.startActiveClass)
    }

    get dragActiveClassList () {
        return this._mergeClassList('drag-active', this.dragActiveClass)
    }

    get dropActiveClassList () {
        return this._mergeClassList('drop-active', this.dropActiveClass)
    }

    isElementDraggable (el) {
        return el.classList.contains(DRAGGABLE_CLASS)
    }

    bindListeners ({ container, viewports, items, model }) {

        model.on('end', () => {
            this.clearPlaceholder({ container })
            this.clearDragStyle({ items })
        })
        // Fixme 重新设计
        // model.on('viewportStateChange', (newState, oldState) => {
        //     const iiState = newState.itemIntersectState
        //     if (iiState.isNone) return
        //     // 从里向外找scrollableParent
        //     const scrollState = viewports.find(el => {
        //         const s = new ScrollState({
        //             el,
        //             orientation: this.orientation
        //         })
        //         return !s.isToEnd(iiState.direction)
        //     })
        //     if (scrollState) {
        //         this.scroller.start({
        //             el: scrollState.el,
        //             orientation: this.orientation,
        //             direction: iiState.direction
        //         })
        //     }
        // })
    }

    // dom action
    blurActiveElement () {
        if (
            document.activeElement &&
            document.activeElement.tagName.toLowerCase() !== 'body'
        ) {
            document.activeElement.blur()
        }
    }

    setOtherItemOffset ({ items, start, offsets }) {
        items.forEach((el, i) => {
            let s = el.style
            if (i === start) return
            s.transform = `translate${this.orientation}(${offsets[i]}px)`
        })
    }

    setTargetPosition ({ startElement, targetRect }) {
        startElement.style.left = targetRect.left + 'px'
        startElement.style.top = targetRect.top + 'px'
    }

    setPlaceholderOffset ({ justifiedOffset }) {
        const style = this.placeholderElement.style
        style.transform = `translate${this.orientation}(${justifiedOffset}px)`
    }

    makePlaceholder ({ targetStartRect }) {
        const placeholder = this.placeholder()
        placeholder.classList.add(PLACEHOLDER_CLASS)

        const s = placeholder.style
        s.height = targetStartRect.height + 'px'
        s.width = targetStartRect.width + 'px'
        this.placeholderElement = placeholder
    }

    setDragStaticStyle ({ items, start, targetStartRect }) {
        items.forEach((el, i) => {
            const s = el.style
            // 与是否Draggable无关
            if (i === start) {
                s.zIndex = 2
                s.position = 'fixed'
                const { top, left, height, width } = targetStartRect
                s.top = top + 'px'
                s.left = left + 'px'
                s.height = height + 'px'
                s.width = width + 'px'
                s.transitionDuration = '0'
                s.transitionTimingFunction = ''
                s.transitionProperty = ''
                s.pointerEvents = 'none'
                s.transfrom = ''
            }
            if (i !== start) {
                s.zIndex = 1
                // Fixme 设置important导致duration失效
                s.transitionDuration = `${this.transitionDuration}ms`
                s.transitionTimingFunction = 'ease'
                s.transitionProperty = 'all'
                s.pointerEvents = 'none'
            }
        })
        if (this.placeholderElement) {
            // TODO 可配置
            const ps = this.placeholderElement.style
            ps.transitionTimingFunction = 'ease'
            ps.zIndex = 0
            ps.transitionProperty = 'all'
            // const size = this.size(this.state.offsetWidth, this.state.offsetHeight)
            // TODO 动态计算移动持续时间
            ps.transitionDuration = `150ms`
        }
    }

    setDropStyle ({ startElement, targetJustifiedRect }) {
        const s = startElement.style
        s.transitionTimingFunction = 'ease'
        s.transitionProperty = 'all'
        // Fixme 动态配置
        s.transitionDuration = `${this.transitionDuration}ms`
        s.left = targetJustifiedRect.left + 'px'
        s.top = targetJustifiedRect.top + 'px'
    }

    // 考虑dom操作（会触发事件）是否适合放到这里
    justifyContainerPosition ({ viewports, viewportRects, targetJustifiedRect, minimumViewport }) {
        if (!viewports.length) return
        // console.log('alignDropPosition')

        const iiState = new IntersectState({
            root: minimumViewport,
            target: targetJustifiedRect,
            orientation: this.orientation
        })
        // console.log('align', iiState)
        if (iiState.isIntersecting) {
            let scrollState
            for (let i = 0; i < viewports.length; ++i) {
                const s = new ScrollState({
                    el: viewports[i],
                    index: i,
                    rect: viewportRects[i],
                    orientation: this.orientation
                })
                if (!s.isToEnd(iiState.direction)) {
                    scrollState = s
                    break
                }
            }
            if (scrollState) {
                const target = elementIsWindow(scrollState.el) ? window : scrollState.el
                // Fixme 可能滚动不到（offset + delta > scrollSize）
                const value = scrollState.scrollOffset - iiState.value
                // console.log('align', value, iiState)
                if (this.orientation === 'X') {
                    target.scrollTo({ left: value, behavior: 'smooth' })
                }
                else {
                    target.scrollTo({ top: value, behavior: 'smooth' })
                }
            }
        }
    }

    // 还原，而不是清空
    clearDragStyle ({ items }) {
        let styles = [
            'zIndex',
            'transitionDuration',
            'transitionTimingFunction',
            'transitionProperty',
            'pointerEvents',
            'position',
            'transform',
            'top',
            'left',
            'width',
            'height'
        ]

        styles.forEach(key => {
            items.forEach(el => {
                el.style[key] = ''
            })
        })
    }

    clearPlaceholder ({ container }) {
        [...container.children]
            .filter(el => el.classList.contains(PLACEHOLDER_CLASS))
            .forEach(el => {
                container.removeChild(el)
            })
        this.placeholderElement = undefined
    }

    onDragStart ({ items, model }) {
        const start = model.startIndex
        const startElement = items[start]
        const targetStartRect = model.getTargetStartRect()

        this.blurActiveElement()
        this.makePlaceholder({ targetStartRect })
        this.setDragStaticStyle({ items, start, targetStartRect })
        startElement.after(this.placeholderElement)
        items
            .filter(this.isElementDraggable)
            .forEach(el => {
                el.classList.remove(...this.startActiveClassList)
                el.classList.add(...this.dragActiveClassList)
            })
    }

    onDragMove ({ items, model }) {
// TODO performance improvement point
        const targetRect = model.getTargetRect()
        const startElement = items[model.startIndex]
        this.setTargetPosition({ targetRect, startElement })
    }

    onDragCross ({ model, items }) {
        const start = model.startIndex
        const offsets = model.getItemsOffset()
        const justifiedOffset = model.getTargetJustifiedOffset()
        this.setOtherItemOffset({ items, start, offsets })
        this.setPlaceholderOffset({ justifiedOffset })
    }

    onDrop ({ items, model }) {
        const startElement = items[model.startIndex]
        // end justified rect
        const targetJustifiedRect = model.getTargetJustifiedRect()
        this.setDropStyle({ startElement, targetJustifiedRect })
    }

    onDragEnd ({ container, items }) {
        this.clearPlaceholder({ container })
        this.clearDragStyle({ items })
    }
}

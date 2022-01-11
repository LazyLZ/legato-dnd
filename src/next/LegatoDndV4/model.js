import { elementIsWindow, throwNanError, translateRect } from './helper.js'
import { EventEmitter } from 'eventemitter3'

export class IntersectState {
    direction = NaN
    value = NaN
    dPositive = NaN
    dNegative = NaN
    threshold = 0
    root
    target

    constructor ({ root, target, orientation = '', threshold = 0 }) {
        this.root = root
        this.target = target
        this.threshold = threshold
        this.orientation = orientation.toUpperCase()
        if (!this.root || !this.target) return

        const dPositive = this.size(
            root.right - target.right,
            root.bottom - target.bottom
        )
        const dNegative = this.size(
            root.left - target.left,
            root.top - target.top
        )
        let direction = NaN
        let value = NaN
        if (dPositive <= threshold && dNegative >= -threshold) {
            direction = 2
        }
        else if (dPositive > threshold && dNegative < -threshold) {
            direction = 0
        }
        else if (dPositive > threshold && dNegative >= -threshold) {
            direction = -1
            value = dNegative
        }
        else if (dPositive <= threshold && dNegative < -threshold) {
            direction = 1
            value = dPositive
        }
        this.dPositive = dPositive
        this.dNegative = dNegative
        this.direction = direction
        this.value = value
    }

    size (x, y) {
        return this.orientation === 'X' ? x : y
    }

    // include value = 0
    get isIntersecting () {
        return this.direction === 1 || this.direction === -1
    }

    get isNone () {
        return !this.root || !this.target
    }
}

export class ViewportState {
    itemIntersectState = new IntersectState({})
    containerIntersectState = new IntersectState({})
    orientation

    constructor ({ itemIntersectState, containerIntersectState, scrollState, orientation }) {
        this.orientation = orientation
        this.itemIntersectState = itemIntersectState || new IntersectState({ orientation })
        this.containerIntersectState = containerIntersectState || new IntersectState({ orientation })

        if (!(
            this.itemIntersectState.orientation === containerIntersectState.orientation &&
            this.itemIntersectState.orientation === scrollState.orientation
        )) {
            throw Error('orientation error')
        }
    }

    get isNearEdge () { // 物品是否接近边界
        return this.itemIntersectState.isIntersecting
    }

    get isFullVisible () { // Container在滚动方向是否已经完全可见

        const itemDirection = this.itemIntersectState.direction
        const { dPositive, dNegative, threshold } = this.containerIntersectState
        if (itemDirection === 1) {
            return dPositive >= threshold
        }
        if (itemDirection === -1) {
            return dNegative <= -threshold
        }
        return (dNegative <= threshold && dPositive >= -threshold)
    }

    get hasItemMoveSpace () {
        const rect = this.containerIntersectState.target
        const { isIntersecting, direction, orientation, target: itemRect } = this.itemIntersectState
        if (!rect || !isIntersecting) return false
        let v
        if (orientation === 'X') {
            v = direction === 1 ? window.innerWidth - rect.right : rect.left
            // console.log('compute move space', v, v >= itemRect.width)
            return v >= itemRect.width
        }
        else {
            v = direction === 1 ? window.innerHeight - rect.bottom : rect.top
            // console.log('compute move space', v, v >= itemRect.height)
            return v >= itemRect.height
        }
    }

    get isNone () {
        return this.itemIntersectState.isNone || this.containerIntersectState.isNone
    }

    equal (viewport) {
        if (this.isNone && viewport.isNone) return true
        if (this.isNone !== viewport.isNone) return false
        return viewport.itemIntersectState === this.itemIntersectState &&
            viewport.containerIntersectState === this.containerIntersectState
    }
}

export class Model extends EventEmitter {
    // props
    orientation
    scrollThreshold
    lockCrossAxis
    lockArea

    // state
    _startFlag = false

    items = []
    itemRects = []

    viewports = []
    viewportRects = []

    startIndex = NaN
    startOffsetX = NaN
    startOffsetY = NaN
    startClientX = NaN
    startClientY = NaN
    startContainerRect = NaN

    endClientX = NaN
    endClientY = NaN
    endOffsetY = NaN
    endOffsetX = NaN
    endIndex = NaN
    endItemRect = NaN
    endContainerRect

    _areaIntersectState = new IntersectState({})
    _viewportState = new ViewportState({})

    constructor (props) {
        super()
        if (props instanceof Object) {
            this.setProps(props)
        }
    }

    get areaIntersectState () {
        return this._areaIntersectState
    }

    set areaIntersectState (v) {
        const oldState = this._areaIntersectState
        const newState = v
        if (oldState.isIntersecting !== newState.isIntersecting) {
            this.emit('areaIntersectStateChange', newState, oldState)
        }
        this._areaIntersectState = v
    }

    get viewportState () {
        return this._viewportState
    }

    set viewportState (v) {
        const newState = v
        const oldState = this._viewportState

        if (!newState.equal(oldState)) {
            this.emit('viewportStateChange', newState, oldState)
        }
        this._viewportState = v
    }

    displacement (x1, y1, x2, y2) {
        return this.size(x1, y1) - this.size(x2, y2)
    }

    size (x, y) {
        return this.orientation === 'X' ? x : y
    }

    pointInRect (x, y, rect) {
        const point = this.size(x, y)
        const start = this.size(rect.left, rect.top)
        const end = this.size(rect.right, rect.bottom)
        // console.log('inRect', point >= start && start <= end, point, start, end)
        return point >= start && point <= end
    }

    setProps ({
        orientation,
        scrollThreshold = 0,
        lockCrossAxis = false,
        lockArea = false
    }) {
        if (this._startFlag) {
            throw Error('Cannot set props during drag.')
        }
        this.orientation = orientation
        this.scrollThreshold = scrollThreshold
        this.lockArea = lockArea
        this.lockCrossAxis = lockCrossAxis
    }

    setItems (items, itemRects) {
        if (!itemRects) {
            itemRects = items.map(el => el.getBoundingClientRect())
        }
        this.items = items
        this.itemRects = itemRects
        // action...
    }

    setViewports (viewports, viewportRects) {
        if (!viewportRects) {
            viewportRects = viewports.map(el => el.getBoundingClientRect())
        }
        this.viewports = viewports
        this.viewportRects = viewportRects
    }

    start ({ clientX, clientY, containerRects }) {
        if (this._startFlag) return
        this._startFlag = true
        throwNanError({ clientX, clientY })
        if (!(containerRects instanceof DOMRectReadOnly)) {
            throw Error('containerRects need DomRectReadOnly, got: ' + containerRects)
        }
        // Fixme 二分查找优化
        this.startIndex = this.itemRects.findIndex(rect => this.pointInRect(clientX, clientY, rect))
        if (this.startIndex == null || this.startIndex < 0) {
            throw Error(`[LegatoDnD] start position out of boundary: (${clientX}, ${clientY})`)
        }
        this.startClientX = clientX
        this.startClientY = clientY
        this.startContainerRect = containerRects
        this.startOffsetX = this.startClientX - this.startContainerRect.left
        this.startOffsetY = this.startClientY - this.startContainerRect.top

        this.endOffsetX = this.startOffsetX
        this.endOffsetY = this.startOffsetY
        this.endClientX = this.startClientX
        this.endClientY = this.startClientY
        this.endItemRect = this.itemRects[this.startIndex]
        this.endContainerRect = containerRects

        this.emit('start', {
            index: this.startIndex,
            clientX,
            clientY,
            containerRects
        })
    }

    updateEndItemRect (clientX, clientY) {
        if (!this._startFlag) return
        if (clientX !== this.endClientX || clientY !== this.endClientY) {
            this.endItemRect = translateRect(
                this.itemRects[this.startIndex],
                clientX - this.startClientX,
                clientY - this.startClientY
            )
        }
    }

    move ({
        clientX = this.endClientX,
        clientY = this.endClientY,
        containerRect = this.endContainerRect
    }) {
        if (!this._startFlag) return
        if (clientX === this.endClientX &&
            clientY === this.endClientY &&
            containerRect === this.endContainerRect) {
            return
        }
        throwNanError({ clientX, clientY })
        if (!(containerRect instanceof DOMRectReadOnly)) {
            throw Error('containerRects need DomRectReadOnly, got: ' + containerRect)
        }
        // console.log('calculate lockArea')
        this.updateEndItemRect(clientX, clientY)

        if (this.lockArea) {
            const state = new IntersectState({
                root: containerRect,
                target: this.endItemRect,
                orientation: this.orientation
            })
            if (state.value) {
                this.orientation === 'X' ? clientX += state.value : clientY += state.value
                this.updateEndItemRect(clientX, clientY)
            }

            this.areaIntersectState = state
        }

        let isIndexChange = false

        this.endContainerRect = containerRect
        this.endClientX = clientX
        this.endClientY = clientY
        this.endOffsetX = this.endClientX - this.endContainerRect.left
        this.endOffsetY = this.endClientY - this.endContainerRect.top
        const oldIndex = this.endIndex

        const d = this.displacement(
            this.endOffsetX,
            this.endOffsetY,
            this.startOffsetX,
            this.startOffsetY
        )

        const boxes = this.itemRects
        const absD = Math.abs(d)
        let p = this.startIndex
        let sum = 0
        // TODO 使用二分查找
        /* eslint-disable */
        while ((d > 0 && p < boxes.length - 1) || (d < 0 && p > 0)) {
            const nextBox = boxes[d > 0 ? p + 1 : p - 1]
            const size = this.size(nextBox.width, nextBox.height)
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
        this.endIndex = p

        if (this.endIndex !== oldIndex) {
            isIndexChange = true
        }

        if (isIndexChange) {
            this.emit('cross', {
                from: this.startIndex,
                to: this.endIndex,
                oldTo: oldIndex
            })
        }

        // Fixme 超大物体，体验不好，移动端，设置为0体验不好，横向滚动，移动端，体验不好
        // 找最小的交叉边界，无论方向
        const pRectList = this.viewportRects
        if (!pRectList.length) {
            this.viewportState = new ViewportState({})
        }

        const ccRect = containerRect
        let iiState, pRect
        for (let i = 0; i < pRectList.length; ++i) {
            const s = new IntersectState({
                root: pRectList[i],
                target: this.endItemRect,
                threshold: this.scrollThreshold,
                orientation: this.orientation
            })
            // console.log('compare', iiState, s)
            if (s.isIntersecting && (!iiState || Math.abs(s.value) > Math.abs(iiState.value))) {
                iiState = s
                pRect = pRectList[i]
            }
        }
        // console.log('getViewportState', iiState)
        if (!iiState) {
            this.viewportState = new ViewportState({})
        }
        const containerIntersectState = new IntersectState({
            root: pRect,
            target: ccRect,
            orientation: this.orientation
            // Fixme 这里threshold不能>0,否则嵌套parent造成无限滚动
        })

        this.viewportState = new ViewportState({
            itemIntersectState: iiState,
            containerIntersectState
        })

        this.emit('move', {
            index: this.endIndex,
            clientX,
            clientY,
            containerRect
        })
        // return { isIndexChange, oldIndex }
    }

    clearModel () {
        if (this._startFlag) {
            throw Error('Cannot clear model during dragging.')
        }
        this.items = []
        this.itemRects = []

        this.viewports = []
        this.viewportRects = []
        this._clearState()
    }

    _clearState () {
        this.startIndex = NaN
        this.startOffsetX = NaN
        this.startOffsetY = NaN
        this.startClientX = NaN
        this.startClientY = NaN
        this.startContainerRect = undefined

        this.endClientX = NaN
        this.endClientY = NaN
        this.endOffsetY = NaN
        this.endOffsetX = NaN
        this.endIndex = NaN
        this.endContainerRect = undefined

        this.areaIntersectState = new IntersectState({})
    }

    end (options = { cancel: false }) {
        if (!this._startFlag) return
        if (options.cancel) {
            this.endIndex = this.startIndex
            this.endOffsetX = this.startOffsetX
            this.endOffsetY = this.startOffsetY
            this.endClientX = this.startClientX
            this.endClientY = this.startClientY
            this.endItemRect = this.itemRects[this.startIndex]
        }
        this._startFlag = false
        if (options.cancel) {
            this.emit('cancel', {
                index: this.endIndex
            })
        }
        else {
            this.emit('end', {
                index: this.endIndex
            })
            if (this.startIndex !== this.endIndex) {
                this.emit('change', {
                    from: this.startIndex,
                    to: this.endIndex
                })
            }
        }
        this._clearState()

    }

    getItemsOffset () {
        const [start, to] = [this.startIndex, this.endIndex]
        const startBox = this.itemRects[start]
        const startSize = this.size(startBox.width, startBox.height)

        return this.itemRects.map((rect, i) => {
            if (i === start) return this.size(this.endOffsetX, this.endOffsetY)
            let value
            if ((i > start && i <= to) || (i >= to && i < start)) {
                value = start < to ? -startSize : startSize
            }
            else {
                value = 0
            }
            return value
        })
    }

    getTargetStartRect () {
        return this.itemRects[this.startIndex]
    }

    getTargetRect () {
        return this.endItemRect
    }

    // Fixme 要缓存住
    getTargetJustifiedRect () {
        const justifiedOffset = this.getTargetJustifiedOffset()
        const scRect = this.startContainerRect
        const ecRect = this.endContainerRect
        const startRect = this.getTargetStartRect()
        const containerDelta = this.displacement(
            ecRect.left,
            ecRect.top,
            scRect.left,
            scRect.top
        )
        const delta = justifiedOffset + containerDelta
        let dX = 0, dY = 0
        this.orientation === 'X' ? dX += delta : dY += delta
        return translateRect(startRect, dX, dY)
    }

    // Fixme 要缓存住
    getTargetJustifiedOffset () {
        const [start, to] = [this.startIndex, this.endIndex]
        if (isNaN(to)) return NaN

        return (start < to ? 1 : -1) * this.itemRects
            .filter((box, i) => {
                return (i > start && i <= to) || (i < start && i >= to)
            })
            .reduce((t, box) => t + this.size(box.width, box.height), 0)
    }

    getMinimumViewport () {
        let r = {}
        r.x = this.scrollableParentRects.reduce((t, a) => Math.max(t, a.left), -Infinity)
        r.right = this.scrollableParentRects.reduce((t, a) => Math.min(t, a.right), Infinity)
        r.y = this.scrollableParentRects.reduce((t, a) => Math.max(t, a.top), -Infinity)
        r.bottom = this.scrollableParentRects.reduce((t, a) => Math.min(t, a.bottom), Infinity)
        r.width = r.right - r.x
        r.height = r.bottom - r.y
        // console.log('minimumParentRect', r.x, r.right, r.y, r.bottom)
        return DOMRectReadOnly.fromRect(r)
    }
}

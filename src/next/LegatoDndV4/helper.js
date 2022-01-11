export function elementIsScrollable (el, orientation) {
    // const scrollSize = this.size(el.scrollWidth, el.scrollHeight)
    const isRoot = el === document.documentElement
    // const clientSize = isRoot
    //     ? this.size(window.innerWidth, window.innerHeight)
    //     : this.size(el.clientWidth, el.clientHeight)

    const style = window.getComputedStyle(el)
    const overflow = style['overflow' + orientation.toUpperCase()]

    const scrollable = overflow === 'scroll' || overflow === 'auto' || (isRoot && overflow !== 'hidden')

    return {
        // isScrollable: scrollSize > clientSize && scrollable,
        isScrollable: scrollable,
        style
    }
}

export function elementIsWindow (el) {
    return el === document.documentElement || el === window
}

export function throwNanError (props) {
    Object.entries(props).forEach(([k, v]) => {
        if (typeof v === 'number' && !isNaN(v)) {
            this[k] = v
        }
        else {
            throw Error('[NaN Error]: ' + k + '=' + v)
        }
    })
}

export function translateRect (r, dX, dY) {
    return DOMRectReadOnly.fromRect({
        x: r.left + dX,
        y: r.top + dY,
        width: r.width,
        height: r.height
    })
}

import {DragDrop, MoveGroup, draggable, handler, OrderChangeEvent} from '../index'
// console.log('dragdrop', DragDrop)

interface ItemType {
    name: string,
    groups?: [number, number][],
    children?: ItemType[]
}
let items: ItemType[] = [
    {
        name: 'AAAAAAAA', children: [
            { name: 'Angela' },
            { name: 'Bob' },
            { name: 'Candy' },
            { name: 'Duke' },
            { name: 'Eve' },
            { name: 'Far' }
        ],
        groups: [[0, 3], [2, 3]]
    },
    {
        name: 'B', children: [
            { name: 'Angela' },
            { name: 'Bob' },
            { name: 'Candy' }
        ]
    },
    {
        name: 'C', children: [
            { name: 'Angela' },
            { name: 'Bob' },
            { name: 'Candy' }
        ]
    }
]
const app = document.getElementById('app') as HTMLElement
const div = document.createElement('div')
div.style.margin = 'auto'
div.style.maxWidth = '1000px'
div.style.overflow = 'auto'


function moveNode (div: HTMLElement, order: number[]) {
    const children = [...div.children]
    const newChildren = order.map(i => children[i])
    console.log('moveNode', children, newChildren)
    children.forEach(c => c.remove())
    div.append(...newChildren)
}


function createInner (items:ItemType[], groups?: MoveGroup[]) {
    const div = document.createElement('div')
    items.forEach(({ name }) => {
        let el: HTMLElement = document.createElement('div')
        el = draggable(el, { handler: false })
        el.style.display = 'flex'
        const handlerEl = document.createElement('div')
        handlerEl.innerText = 'InnerHandler'
        el.append(
            handler(handlerEl),
            document.createElement('input'),
            name
        )
        div.appendChild(el)
    })
    const dragDrop = new DragDrop({
        container: div,
        vertical: true,
        lockCrossAxis: true,
        touchStartDelay: 200,
        groups
    })
    dragDrop.on('orderChange', ({ order }) => {
        moveNode(div, order)
    })
    return div
}

function createOuter (items: ItemType[]) {
    const div = document.createElement('div')
    items.forEach(({ name, groups, children }) => {
        let el: HTMLElement = document.createElement('div')
        el = draggable(el, { handler: false })
        el.style.display = 'flex'
        el.style.backgroundColor = '#f2f2f2'
        const handlerEl = document.createElement('div')
        handlerEl.innerText = 'Handler' + name
        const inner = createInner(children || [], groups)
        el.append(
            handler(handlerEl),
            inner
        )
        div.appendChild(el)
    })
    const dragDrop = new DragDrop({
        container: div,
        lockCrossAxis: true
    })
    dragDrop.on('orderChange', ({ order }: OrderChangeEvent) => {
        moveNode(div, order)
    })
    return div
}

div.append(createOuter(items))

app.append(div)

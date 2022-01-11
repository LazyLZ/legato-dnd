import {CONTAINER_CLASS} from '../dist'


const app = document.getElementById('app')
const div = document.createElement('div')
div.style.margin = 'auto'
div.style.maxWidth = '1000px'

function createInner() {
    const div = document.createElement('div')
}

function createOuter() {
    document.createElement('div')
}

app.append(div)

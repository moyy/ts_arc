import { DrawText } from "./draw_text.js"

const fillArcChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (dt) {
        dt.set_fill_arc(target.checked);
        dt.redraw();
    }
}

const fillSvgChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (dt) {
        dt.set_fill_svg(target.checked);
        dt.redraw();
    }
}

const inputChange = (event: Event) => {
    let target = event.target as HTMLInputElement;
    if (dt) {
        dt.set_text(target.value);
        dt.redraw();
    }
}

let dt: DrawText | null = null;
let canvas = document.getElementById('myCanvas');
if (canvas) {
    let c = canvas as HTMLCanvasElement;
    const context = c.getContext('2d');
    if (context) {
        dt = new DrawText(context, "font/msyh.ttf");

        const fillSvgElement = document.getElementById("fillSvg") as HTMLInputElement;
        if (fillSvgElement) {
            dt.set_fill_svg(fillSvgElement.checked);
            fillSvgElement.addEventListener("change", fillSvgChange);
        }

        const fillArcElement = document.getElementById("fillArc") as HTMLInputElement;
        if (fillArcElement) {
            dt.set_fill_arc(fillArcElement.checked);
            fillArcElement.addEventListener("change", fillArcChange);
        }

        const inputElement = document.getElementById('char') as HTMLInputElement;;
        if (inputElement) {
            dt.set_text(inputElement.value);
            inputElement.addEventListener('input', inputChange);

        }
        
        dt.draw(300, 300, c.width, c.height);
    }
}
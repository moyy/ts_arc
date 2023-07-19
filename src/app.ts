import { SdfContext } from "sdf/draw_sdf.js";
import { set_gl } from "sdf/glyph.js";
import { DrawText } from "./draw_text.js"

document.addEventListener('DOMContentLoaded', (_) => {
    if (document === null) {
        alert("Failed to get document!");
        return;
    }

    let c = document.getElementById('sdf-canvas') as HTMLCanvasElement;
    if (!c) {
        alert("Failed to get sdf-canvas!");
        return;
    }
    let sdfContext = new SdfContext(c);
    set_gl(sdfContext.gl);
    sdfContext.draw();

    c = document.getElementById('font-canvas') as HTMLCanvasElement;
    if (!c) {
        alert("Failed to get font-canvas!");
        return;
    }
    let fontCanvas = c;
    const fontContext = fontCanvas.getContext('2d');
    if (!fontContext) {
        alert("Failed to get font-canvas context!");
        return;
    }

    fontCanvas.addEventListener('mousedown', (event) => {
        let rect = fontCanvas.getBoundingClientRect();
        let x = event.clientX - rect.left;
        let y = event.clientY - rect.top;

        if (dt) {
            dt.set_mouse_down(x, y);
            dt.draw();
            afterDraw();
        }
    });

    const arcCountElement = document.getElementById('arc_count') as HTMLElement;

    const setArcCount = (value: number) => {
        if (arcCountElement) {
            arcCountElement.innerHTML = value.toString();
        }
    }

    const bezierCountElement = document.getElementById('bezier_count') as HTMLElement;
    const setBezierCount = (value: number) => {
        if (bezierCountElement) {
            bezierCountElement.innerHTML = value.toString();
        }
    }

    const dataTexturePixelsElement = document.getElementById('data_texture_pixels') as HTMLElement;
    const setDataTexturePixel = (show: string) => {
        if (dataTexturePixelsElement) {
            dataTexturePixelsElement.innerHTML = show;
        }
    }

    let dt = new DrawText(fontContext, "font/msyh.ttf");

    const afterDraw = () => {
        setTimeout(() => {
            sdfContext.setChar(dt.get_char());

            setArcCount(dt.get_arc_count());
            setBezierCount(dt.get_bezier_count());
            setDataTexturePixel(dt.get_blob_string());
        }, 1);
    };

    const charElement = document.getElementById('char') as HTMLInputElement
    const charValue = charElement ? charElement.value : "A";
    dt.set_char(charValue);
    charElement.addEventListener('input', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_char(target.value);
        dt.draw();

        afterDraw();
    });

    const convertInputToNumber = (inputValue: string) => {
        if (!/^\d+$/.test(inputValue)) {
            console.warn(`警告: 大小设置，输入不完全是数字，value = ${inputValue}`);
            return -1;
        }

        return Number(inputValue);
    }

    const charSizeElement = document.getElementById('char_size') as HTMLInputElement
    const charSizeValue = charSizeElement ? charSizeElement.value : "256";
    let size = convertInputToNumber(charSizeValue);
    if (size > 0) {
        dt.set_char_size(size);
    }
    charSizeElement.addEventListener('input', function (event) {
        let target = event.target as HTMLInputElement;
        let size = convertInputToNumber(target.value);
        if (size > 0) {
            dt.set_char_size(size);
        }
        dt.draw();
        afterDraw();
    });

    const bezierRenderElement = document.getElementById('isBezierRender') as HTMLInputElement
    const isBezierRender = bezierRenderElement ? bezierRenderElement.checked : false;
    dt.set_render_bezier(isBezierRender);
    bezierRenderElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_render_bezier(target.checked);
        dt.draw();

        afterDraw();

    });

    const bezierFillElement = document.getElementById('bezierFill') as HTMLInputElement;
    const isBezierFill = bezierFillElement ? bezierFillElement.checked : false;
    dt.set_bezier_fill(isBezierFill);
    bezierFillElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_bezier_fill(target.checked);
        dt.draw();

        afterDraw();

    });

    const bezierStrokeElement = document.getElementById('bezierStroke') as HTMLInputElement;
    bezierStrokeElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_bezier_fill(!target.checked);
        dt.draw();

        afterDraw();
    });

    const bezierEndpointsElement = document.getElementById('bezierEndpoints') as HTMLInputElement;
    const bezierEndpoints = bezierEndpointsElement ? bezierEndpointsElement.checked : false;
    dt.set_bezier_endpoints(bezierEndpoints);
    bezierEndpointsElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_bezier_endpoints(target.checked);
        dt.draw();

        afterDraw();
    });

    const arcRenderElement = document.getElementById('isArcRender') as HTMLInputElement
    const isArcRender = arcRenderElement ? arcRenderElement.checked : false;
    dt.set_render_arc(isArcRender);
    arcRenderElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_render_arc(target.checked);
        dt.draw();

        afterDraw();
    });

    const arcFillElement = document.getElementById('arcFill') as HTMLInputElement;
    const isArcFill = arcFillElement ? arcFillElement.checked : false;
    dt.set_arc_fill(isArcFill);
    arcFillElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_arc_fill(target.checked);
        dt.draw();

        afterDraw();
    });

    const arcStrokeElement = document.getElementById('arcStroke') as HTMLInputElement;
    arcStrokeElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_arc_fill(!target.checked);
        dt.draw();

        afterDraw();
    });

    const arcEndpointsElement = document.getElementById('arcEndpoints') as HTMLInputElement;
    const arcEndpoints = arcEndpointsElement ? arcEndpointsElement.checked : false;
    dt.set_arc_endpoints(arcEndpoints);
    arcEndpointsElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_arc_endpoints(target.checked);
        dt.draw();

        afterDraw();
    });

    const networkRenderElement = document.getElementById('grid') as HTMLInputElement
    const isNetworkRender = networkRenderElement ? networkRenderElement.checked : false;
    dt.set_render_network(isNetworkRender);
    networkRenderElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_render_network(target.checked);
        dt.draw();

        afterDraw();
    });

    const sdfRenderElement = document.getElementById('isSDFRender') as HTMLInputElement
    const isSDFRender = sdfRenderElement ? sdfRenderElement.checked : false;
    dt.set_render_sdf(isSDFRender);
    networkRenderElement.addEventListener('change', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_render_sdf(target.checked);
        dt.draw();

        afterDraw();
    });

    dt.set_init_pos(300, 2100);
    dt.set_init_size(fontCanvas.width, fontCanvas.height);
    dt.draw();

    afterDraw();
});
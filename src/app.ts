import { DrawText } from "./draw_text.js"


document.addEventListener('DOMContentLoaded', (_) => {
    if (document === null) {
        alert("Failed to get document!");
        return;
    }

    let canvas = document.getElementById('myCanvas');
    if (!canvas) {
        alert("Failed to get canvas!");
        return;
    }

    let c = canvas as HTMLCanvasElement;
    const context = c.getContext('2d');
    if (!context) {
        alert("Failed to get canvas context!");
        return;
    }

    c.addEventListener('mousedown', (event) => {
        let rect = c.getBoundingClientRect();
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

    const cellCountElement = document.getElementById('cell_count') as HTMLElement;
    const setCellCount = (width: number, height: number) => {
        if (cellCountElement) {
            cellCountElement.innerHTML = `width = ${width}, height = ${height}`
        }
    }

    const dataTexturePixelsElement = document.getElementById('data_texture_pixels') as HTMLElement;
    const setDataTexturePixel = (before: number, after: number) => {
        if (dataTexturePixelsElement) {
            dataTexturePixelsElement.innerHTML = `before = ${before}, after = ${after}`;
        }
    }

    let dt = new DrawText(context, "font/msyh.ttf");

    const afterDraw = () => {
        setTimeout(() => {
            setArcCount(dt.get_arc_count());
            setBezierCount(dt.get_bezier_count());

            setCellCount(...dt.get_cell_count());
            setDataTexturePixel(...dt.get_data_texture_pixels());
        }, 1);
    };

    const charElement = document.getElementById('char') as HTMLInputElement
    const charValue = charElement ? charElement.value : "A";
    dt.set_text(charValue);
    charElement.addEventListener('input', function (event) {
        let target = event.target as HTMLInputElement;
        dt.set_text(target.value);
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
    dt.set_init_size(c.width, c.height);
    dt.draw();

    afterDraw();
});
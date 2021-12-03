import {tiny} from './common.js';
// Pull these names into this module's scope for convenience:
const {vec3, vec, Shape} = tiny;

export class Shape_From_File extends Shape {                                   // **Shape_From_File** is a versatile standalone Shape that imports
                                                                               // all its arrays' data from an .obj 3D model file.
    constructor(filename, load = true) {
        super("position", "normal", "texture_coord");
        // Begin downloading the mesh. Once that completes, return
        // control to our parse_into_mesh function.
        this.fileName = filename;
        if (load) this.load_file();
    }

    /**
     *
     * @param filename
     * @param normalize
     * @param ready
     * @returns {Promise<void>}
     */
    load_file(normalize = true) {                             // Request the external file and wait for it to load.
        // Failure mode:  Loads an empty shape.
        return fetch(this.fileName)
            .then(response => {
                if (response.ok) return Promise.resolve(response.text())
                else return Promise.reject(response.status)
            })
            .then(obj_file_contents => this.parse_into_mesh(obj_file_contents, normalize))
            .catch(error => {
                console.log(error)
                this.copy_onto_graphics_card(this.gl);
            })
    }

    parse_into_mesh(data, normalize) {                           // Adapted from the "webgl-obj-loader.js" library found online:
        var verts = [], vertNormals = [], textures = [], unpacked = {};

        unpacked.verts = [];
        unpacked.norms = [];
        unpacked.textures = [];
        unpacked.hashindices = {};
        unpacked.indices = [];
        unpacked.index = 0;

        var lines = data.split('\n');

        var VERTEX_RE = /^v\s/;
        var NORMAL_RE = /^vn\s/;
        var TEXTURE_RE = /^vt\s/;
        var FACE_RE = /^f\s/;
        var WHITESPACE_RE = /\s+/;

        var texture_coord_dim = 2;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            var elements = line.split(WHITESPACE_RE);
            elements.shift();

            if (TEXTURE_RE.test(line)) texture_coord_dim = elements.length;

            if (VERTEX_RE.test(line)) verts.push.apply(verts, elements);
            else if (NORMAL_RE.test(line)) vertNormals.push.apply(vertNormals, elements);
            else if (TEXTURE_RE.test(line)) textures.push.apply(textures, elements);
            else if (FACE_RE.test(line)) {
                var quad = false;
                for (var j = 0, eleLen = elements.length; j < eleLen; j++) {
                    if (j === 3 && !quad) {
                        j = 2;
                        quad = true;
                    }
                    if (elements[j] in unpacked.hashindices)
                        unpacked.indices.push(unpacked.hashindices[elements[j]]);
                    else {
                        var vertex = elements[j].split('/').map(Number);
                        if (vertex[0] < 0) vertex[0] += verts.length / 3 + 1;
                        if (vertex[1] < 0) vertex[1] += textures.length / texture_coord_dim + 1;
                        if (vertex[2] < 0) vertex[2] += vertNormals.length / 3 + 1;

                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);

                        if (textures.length) {
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * texture_coord_dim + 0]);
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * texture_coord_dim + 1]);
                        }

                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 0]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 1]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 2]);

                        unpacked.hashindices[elements[j]] = unpacked.index;
                        unpacked.indices.push(unpacked.index);
                        unpacked.index += 1;
                    }
                    if (j === 3 && quad) unpacked.indices.push(unpacked.hashindices[elements[0]]);
                }
            }
        }
        {
            const {verts, norms, textures} = unpacked;
            for (var j = 0; j < verts.length / 3; j++) {
                this.arrays.position.push(vec3(verts[3 * j], verts[3 * j + 1], verts[3 * j + 2]));
                this.arrays.normal.push(vec3(norms[3 * j], norms[3 * j + 1], norms[3 * j + 2]));
                this.arrays.texture_coord.push(vec(textures[2 * j], textures[2 * j + 1]));
            }
            this.indices = unpacked.indices;
        }
        if (normalize) this.normalize_positions(false);
        this.ready = true;
    }

    draw(context, program_state, model_transform, material) {               // draw(): Same as always for shapes, but cancel all
        // attempts to draw the shape before it loads:
        if (this.ready)
            super.draw(context, program_state, model_transform, material);
    }
}


export class ShapesFromObject {
    constructor(filenames, materials) {
        this.shapes = []
        this.materials = materials
        this.ready = false

        this.load_files(filenames);
    }

    load_files(filenames) {
        // Failure mode:  Loads an empty shape.
        this.shapes = filenames.map((e) => new Shape_From_File(e, false))
        return Promise.all(this.shapes.map((e) => e.load_file(false)))
            .then(() => {
                let p_arr = this.shapes.reduce((l, e) => l.concat(e.arrays.position), []);
                const average_position = p_arr.reduce((acc, p) => acc.plus(p.times(1 / p_arr.length)),
                    vec3(0, 0, 0));
                p_arr = p_arr.map(p => p.minus(average_position));           // Center the point cloud on the origin.
                this.shapes.forEach((e) => e.arrays.position = e.arrays.position.map(p => p.minus(average_position)))

                const average_lengths = p_arr.reduce((acc, p) =>
                    acc.plus(p.map(x => Math.abs(x)).times(1 / p_arr.length)), vec3(0, 0, 0));
                p_arr = p_arr.map(p => p.times(1 / average_lengths.norm()));
                this.shapes.forEach((e) => e.arrays.position = e.arrays.position.map(p => p.times(1 / average_lengths.norm())))
            })
            .then((() => {
                this.ready = true;
            }))
    }

    draw(context, program_state, model_transform) {               // draw(): Same as always for shapes, but cancel all
        // attempts to draw the shape before it loads:
        if (this.ready) {
            for (let i = 0; i < this.materials.length; i ++) {
                this.shapes[i].draw(context, program_state, model_transform, this.materials[i])
            }
        }
    }
}

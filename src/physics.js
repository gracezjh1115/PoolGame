import {Body} from "./body.js";
import {defs, tiny} from './common.js';

// Pull these names into this module's scope for convenience:
const {vec3, unsafe3, vec4, color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;


// simple physics model
// we assume that only object in contact can exert a force on each other 
export class Physics {
    constructor(g=9.81)
    {
        this.g = g;
    }
    
    
    
}
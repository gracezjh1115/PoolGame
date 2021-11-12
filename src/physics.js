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
    
    // update the state of the two ball involve in a collision
    static resolve_ball_ball_collision(a, b)
    {
        let a_center = a.center;
        let b_center = b.center;

    }

    // update the state of the ball involve in a collision with a wall
    static resolve_ball_wall_collision(ball, wall)
    {
        
    }
    
}
import {defs, tiny} from './src/common.js';
import {Body} from "./src/body.js";
import {Physics} from "./src/physics.js"
import {Shape_From_File} from './examples/obj-file-demo.js'

// Pull these names into this module's scope for convenience:
const {vec3, unsafe3, vec4, color, hex_color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;

export class Simulation extends Scene {
    // **Simulation** manages the stepping of simulation time.  Subclass it when making
    // a Scene that is a physics demo.  This technique is careful to totally decouple
    // the simulation from the frame rate (see below).
    constructor() {
        super();
        this.pm = new Physics();
        Object.assign(this, {time_accumulator: 0, time_scale: 1, t: 0, dt: 1 / 20, bodies: [], steps_taken: 0});
    }

    simulate(frame_time) {
        // simulate(): Carefully advance time according to Glenn Fiedler's
        // "Fix Your Timestep" blog post.
        // This line gives ourselves a way to trick the simulator into thinking
        // that the display framerate is running fast or slow:
        frame_time = this.time_scale * frame_time;

        // Avoid the spiral of death; limit the amount of time we will spend
        // computing during this timestep if display lags:
        this.time_accumulator += Math.min(frame_time, 0.1);
        // Repeatedly step the simulation until we're caught up with this frame:
        while (Math.abs(this.time_accumulator) >= this.dt) {
            // Single step of the simulation for all bodies:
            this.update_state(this.dt);
            // Following the advice of the article, de-couple
            // our simulation time from our frame rate:
            this.t += Math.sign(frame_time) * this.dt;
            this.time_accumulator -= Math.sign(frame_time) * this.dt;
            this.steps_taken++;
        }
        // Store an interpolation factor for how close our frame fell in between
        // the two latest simulation time steps, so we can correctly blend the
        // two latest states and display the result.
        let alpha = this.time_accumulator / this.dt;
        for (let b of this.pm.bodies) b.blend_state(alpha);
    }

    make_control_panel() {
        // make_control_panel(): Create the buttons for interacting with simulation time.
        this.key_triggered_button("Speed up time", ["Shift", "T"], () => this.time_scale *= 5);
        this.key_triggered_button("Slow down time", ["t"], () => this.time_scale /= 5);
        this.new_line();
        this.live_string(box => {
            box.textContent = "Time scale: " + this.time_scale
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = "Fixed simulation time step size: " + this.dt
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = this.steps_taken + " timesteps were taken so far."
        });
    }

    display(context, program_state) {
        // display(): advance the time and state of our whole simulation.
        if (program_state.animate)
            this.simulate(program_state.animation_delta_time);
        // Draw each shape at its current location:
        for (let b of this.pm.bodies)
            b.shape.draw(context, program_state, b.drawn_location, b.material);
    }

    update_state(dt)      // update_state(): Your subclass of Simulation has to override this abstract function.
    {
        throw "Override this"
    }
}


export class Test_Data {
    // **Test_Data** pre-loads some Shapes and Textures that other Scenes can borrow.
    constructor() {
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            grid: new Texture("assets/grid.png"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
        }
        this.shapes = {
            donut: new defs.Torus(15, 15, [[0, 2], [0, 1]]),
            cone: new defs.Closed_Cone(4, 10, [[0, 2], [0, 1]]),
            capped: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            ball: new defs.Subdivision_Sphere(4, [[0, 1], [0, 1]]),
            cube: new defs.Cube(),
            prism: new (defs.Capped_Cylinder.prototype.make_flat_shaded_version())(10, 10, [[0, 2], [0, 1]]),
            gem: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            donut2: new (defs.Torus.prototype.make_flat_shaded_version())(20, 20, [[0, 2], [0, 1]]),
            //background
            "pooltable": new Shape_From_File("assets/background/pool_table.obj"),
            "cuestick": new Shape_From_File("assets/background/cue_stick.obj"),
        };
    }

    random_shape(shape_list = this.shapes) {
        // random_shape():  Extract a random shape from this.shapes.
        const shape_names = Object.keys(shape_list);
        return shape_list[shape_names[~~(shape_names.length * Math.random())]]
    }
}

export class Pool_Scene extends Simulation {
    // ** Inertia_Demo** demonstration: This scene lets random initial momentums
    // carry several bodies until they fall due to gravity and bounce.
    constructor() {
        super();
        this.data = new Test_Data();
        this.shapes = Object.assign({}, this.data.shapes);
        this.shapes.square = new defs.Square();
        this.collider = {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .3};
      

        const shader = new defs.Fake_Bump_Map(1);

        this.materials = {
            stars: new Material(shader, {
                color: hex_color("#eeeee4"),
                ambient: .4, texture: this.data.textures.stars
            }),
            background: new Material(shader, {
                color: hex_color("#ffffff"),
                ambient: .4, texture: this.data.textures.earth
            }),
            white_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
            red_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ff0000")}),
            green_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .3, diffusivity: .6, color: hex_color("#00ff00")}),
        };


        // cuestick
        this.pm.bodies.push(new Body(this.shapes.cuestick, this.materials.stars, vec3(15,15,25))
                                .emplace(Mat4.rotation(1/3 *Math.PI, 1, 1, 1)
                                             .times(Mat4.translation(-3, -5, -30)), vec3(0,0,0), 0));

        // balls
        let z = 10;
        for (let i = 0; i < 10; i++)
        {   
            this.pm.bodies.push(new Body(this.shapes.ball, this.materials.red_plastic, vec3(1,1,1), 0, 0.2)
                                    .emplace(Mat4.translation(5, -5, z), vec3(8, 0, 8), 0));
            z -= 2.5
        }

        // invisible walls to detect collision with the walls

        this.walls_polygon = this.pm.walls.map((w) => new defs.Polygon(w))
    }

    random_color() {
        return this.material.override(color(.6, .6 * Math.random(), .6 * Math.random(), 1));
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:
        

//         while (this.bodies.length < 150)
//             this.bodies.push(new Body(this.data.random_shape(), this.random_color(), vec3(1, 1 + Math.random(), 1))
//                 .emplace(Mat4.translation(...vec3(0, 15, 0).randomized(10)),
//                     vec3(0, -1, 0).randomized(2).normalized().times(3), Math.random()));

//         for (let b of this.bodies) {
//             // Gravity on Earth, where 1 unit in world space = 1 meter:
//             b.linear_velocity[1] += dt * -9.8;
//             // If about to fall through floor, reverse y velocity:
//             if (b.center[1] < -8 && b.linear_velocity[1] < 0)
//                 b.linear_velocity[1] *= -.8;
//         }
//         // Delete bodies that stop or stray too far away:
//         this.bodies = this.bodies.filter(b => b.center.norm() < 50 && b.linear_velocity.norm() > 2);
//         for (let a of this.bodies)
//         {
//             // Cache the inverse of matrix of body "a" to save time.
//             a.inverse = Mat4.inverse(a.drawn_location);
//             // Apply a small centripetal force to everything.
//
//             // if a is stationary
//             if (a.linear_velocity.norm() == 0)
//                 continue;
//             // *** Collision process is here ***
//             // Loop through all bodies again (call each "b"):
//             for (let b of this.bodies) {
//                 // Pass the two bodies and the collision shape to check_if_colliding():
//                 if (!a.check_if_colliding(b, this.collider))
//                     continue;
//                 // If we get here, we collided, so turn red and zero out the
//                 // velocity so they don't inter-penetrate any further.
//
//
//             }
//         }

        let endPoint = new Map()
        this.pm.bodies.forEach( b => {
            b.set_previous()
            let collision_prediction = this.pm.get_earliest_collision_info(b, this.dt)
            endPoint.set(b, {start_time: 0, ...collision_prediction, end_time : collision_prediction.dt})
        })

        while (endPoint.size !== 0) {
            let earliest = this.dt * 2
            let earliest_body = null
            for (let [b, v] of endPoint.entries()) {
                if (v.end_time < earliest) {
                    earliest = v.end_time
                    earliest_body = b
                }
            }

            let object_collision_info = endPoint.get(earliest_body)
            earliest_body.advance(object_collision_info.dt, false)
            earliest_body.center = object_collision_info.position
            earliest_body.linear_velocity = object_collision_info.velocity
            let new_start_time = object_collision_info.end_time
            if (new_start_time > this.dt - 1e-10) endPoint.delete(earliest_body)
            else {
                let collision_prediction = this.pm.get_earliest_collision_info(earliest_body, this.dt - new_start_time)
                endPoint.set(earliest_body, {
                    start_time: new_start_time, ...collision_prediction,
                    end_time: collision_prediction.dt + new_start_time
                })
            }
        }
    }

    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.

        //first, draw everything inherit from parent class, all the moving objects in this case
        

        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            this.children.push(new defs.Program_State_Viewer());
            program_state.set_camera(Mat4.translation(0, 0, -50));    // Locate the camera here (inverted matrix).
        }
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 1, 500);
        program_state.lights = [new Light(vec4(0, -20, -10, 1), color(1, 1, 1, 1), 100000),
                                new Light(vec4(0, -20, -10, -50), color(1, 1, 1, 1), 100000),
                                new Light(vec4(10, -20, -10, 0), color(1, 1, 1, 1), 100000),
                                new Light(vec4(10, -20, -10, 50), color(1, 1, 1, 1), 100000)];
        super.display(context, program_state);
        // Draw the ground:

        //Draw the table:
        // Draw the backgorund
        let tf = Mat4.translation(0,-10,0).times(Mat4.scale(100,100,100));
        this.shapes.cube.draw(context, program_state, tf, this.materials.background);

        // Draw the table
        tf = Mat4.translation(0,-10,0).times(Mat4.scale(25,25,25));
        this.shapes.pooltable.draw(context, program_state, tf, this.materials.green_plastic);

        // display invisible wall for testing
        const display_wall = true
        if (display_wall) {
            for (let w of this.walls_polygon) {
                w.draw(context, program_state, Mat4.identity(), this.materials.white_plastic)
            }
        }
    }

//     show_explanation(document_element) {
//         document_element.innerHTML += `<p>This demo lets random initial momentums carry bodies until they fall and bounce.  It shows a good way to do incremental movements, which are crucial for making objects look like they're moving on their own instead of following a pre-determined path.  Animated objects look more real when they have inertia and obey physical laws, instead of being driven by simple sinusoids or periodic functions.
//                                      </p><p>For each moving object, we need to store a model matrix somewhere that is permanent (such as inside of our class) so we can keep consulting it every frame.  As an example, for a bowling simulation, the ball and each pin would go into an array (including 11 total matrices).  We give the model transform matrix a \"velocity\" and track it over time, which is split up into linear and angular components.  Here the angular velocity is expressed as an Euler angle-axis pair so that we can scale the angular speed how we want it.
//                                      </p><p>The forward Euler method is used to advance the linear and angular velocities of each shape one time-step.  The velocities are not subject to any forces here, but just a downward acceleration.  Velocities are also constrained to not take any objects under the ground plane.
//                                      </p><p>This scene extends class Simulation, which carefully manages stepping simulation time for any scenes that subclass it.  It totally decouples the whole simulation from the frame rate, following the suggestions in the blog post <a href=\"https://gafferongames.com/post/fix_your_timestep/\" target=\"blank\">\"Fix Your Timestep\"</a> by Glenn Fielder.  Buttons allow you to speed up and slow down time to show that the simulation's answers do not change.</p>`;
//     }
}

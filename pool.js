import {defs, tiny} from './src/common.js';
import {Body} from "./src/body.js";
import {Physics} from "./src/physics.js"
import {Shape_From_File} from './examples/obj-file-demo.js'

// Pull these names into this module's scope for convenience:
const {vec, vec3, unsafe3, vec4, color, hex_color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;

const {Textured_Phong, Phong_Shader} = defs

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
            club: new Texture("assets/club.jpg"),
        }
        this.shapes = {
            donut: new defs.Torus(15, 15, [[0, 2], [0, 1]]),
            cone: new defs.Closed_Cone(4, 10, [[0, 2], [0, 1]]),
            capped: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            ball: new defs.Subdivision_Sphere(4, [[0, 1], [0, 1]]),
            cube: new defs.Cube(),
            square: new defs.Square(),
            prism: new (defs.Capped_Cylinder.prototype.make_flat_shaded_version())(10, 10, [[0, 2], [0, 1]]),
            gem: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            donut2: new (defs.Torus.prototype.make_flat_shaded_version())(20, 20, [[0, 2], [0, 1]]),
            //background
            //table 2: https://www.cgtrader.com/items/2816943
            cuestick: new Shape_From_File("assets/background/cue_stick.obj"),
            tableLeg: new Shape_From_File("assets/background/table_decomposed/TableLeg.obj"),
            outerEdge: new Shape_From_File("assets/background/table_decomposed/OuterEdge.obj"),
            pocket: new Shape_From_File("assets/background/table_decomposed/Pocket.obj"),
            diamond: new Shape_From_File("assets/background/table_decomposed/Diamond.obj"),
            innerEdge: new Shape_From_File("assets/background/table_decomposed/InnerEdge.obj"),
            plane: new Shape_From_File("assets/background/table_decomposed/Plane.obj"),
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
        this.camera_pos = Mat4.look_at(vec3(0,70,0), vec3(0,0,0), vec3(1,0,0));
        
        // 0 = selecting direction, 1 = selecting power, 2 = firing, 3 = balls moving 
        this.game_state = 0;
        this.down_start = 0;
        this.power = 0;
        this.cueball_init_speed = 0;
        this.cueball_direction = vec3(0,0,0);
      

        const shader = new defs.Fake_Bump_Map(1);

        this.materials = {
            stars: new Material(shader, {
                color: hex_color("#eeeee4"),
                ambient: .4, texture: this.data.textures.stars
            }),
            map_sat : new Material(new defs.Textured_Phong(1), {
                color: hex_color("#000000"),
                ambient: .8, diffusivity: .5, specularity: .5, texture: new Texture("assets/map-saturation.png")
            }),
            background: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1., texture: this.data.textures.club
            }),
            white_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
            red_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ff0000")}),
            green_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .7, diffusivity: .3, specularity: 0, color: hex_color("#005500")}),
            table_leg_texture: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: 1., texture: new Texture("assets/background/table_decomposed/metalic.jpg")
            }),
            outer_edge_texture: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: .9, texture: new Texture("assets/background/table_decomposed/OuterEdge.png")
            }),
            pocket_texture: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .1, specularity: .5, texture: new Texture("assets/background/table_decomposed/PocketTexture.png")
            }),
            inner_edge_texture: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .9, specularity: .9, texture: new Texture("assets/background/table_decomposed/InnerEdge.png")
            }),
            plane_texture: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: .9, texture: new Texture("assets/background/table_decomposed/Plane.png")
            }),
            floor_texture: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: .7, diffusivity: .8, specularity: .9, texture: new Texture("assets/background/floor.png")
            }),
            

        };



        // balls
        let z = 10;
        for (let i = 0; i < 9; i++)
        {   
            this.pm.bodies.push(new Body(this.shapes.ball, this.materials.red_plastic, vec3(1,1,1), 0, 0.2)
                                    .emplace(Mat4.translation(5, -5, z), vec3(4, 0, 4), 0));
            z -= 2.5
        }

        // cueball
        this.cueball = new Body(this.shapes.ball, this.materials.white_plastic, vec3(1,1,1), 0, 0.2)
            .emplace(Mat4.translation(10, -5, 3), vec3(0, 0, 0), 0)
        this.pm.bodies.push(this.cueball)
//         this.cueball_pos = Mat4.translation(10,-5, 3);

        // cuestick
        this.cuestick_pos = Mat4.rotation(0.2, 1,0,0).times(Mat4.translation(0,0,-12));

        // invisible walls to detect collision with the walls

        this.walls_polygon = this.pm.walls.map((w) => new defs.Polygon(w));
        this.pockets_cylinder = new defs.Capped_Cylinder(5, 20);

        // decomposed table models
        this.table_leg_transformation = Mat4.identity();
        this.table_leg_transformation = this.table_leg_transformation.times(Mat4.scale(1.1,1.05,1.05));
        this.outer_edge_transformation = Mat4.identity();
        this.outer_edge_transformation = this.outer_edge_transformation.times(Mat4.translation(0,0.35,0));
        this.pocket_transformation = Mat4.identity();
        this.pocket_transformation = this.pocket_transformation.times(Mat4.translation(0,0.35,0)).times(Mat4.scale(1.03,1.03,1.03));
        this.diamond_transformation = Mat4.identity();
        this.diamond_transformation = this.diamond_transformation.times(Mat4.translation(0,0.45,-0.01)).times(Mat4.scale(0.9,.9,.9));
        this.inner_edge_transformation = Mat4.identity();
        this.inner_edge_transformation = this.inner_edge_transformation.times(Mat4.translation(0,0.42,0)).times(Mat4.scale(1.01,1.01,1.01));
        this.plane_transformation = Mat4.identity();
        this.plane_transformation = this.plane_transformation.times(Mat4.translation(0,0.35,0)).times(Mat4.scale(.81,.8,.8));
        
        // light source
        this.light_src = new Material(new Phong_Shader(), {
            color: color(1, 1, 1, 1), ambient: 1, diffusivity: 0, specularity: 0
        });
    }

    random_color() {
        return this.material.override(color(.6, .6 * Math.random(), .6 * Math.random(), 1));
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:

        while (dt >= 1E-5) {
            let bodySimulationStages = new Map()
            let earliest = dt * 2
            this.pm.bodies.forEach(b => {
                if (this.dt === dt) b.set_previous()
                let collision_prediction = this.pm.get_earliest_collision_info(b, dt)
                bodySimulationStages.set(b, collision_prediction)
                earliest = Math.min(earliest, collision_prediction.dt)
            })

            this.pm.bodies.forEach(b => {
                if (!bodySimulationStages.has(b)) return;
                if (bodySimulationStages.get(b).dt > earliest + 1E-5) {
                    b.advance(earliest, false)
                    bodySimulationStages.delete(b)
                    return;
                }

                const object_collision_info = bodySimulationStages.get(b)
                b.advance(earliest, false)
                b.center = object_collision_info.position
                b.linear_velocity = object_collision_info.velocity
                bodySimulationStages.delete(b)

                //if ball-ball collision,
                if (object_collision_info.other) {
                    let body = object_collision_info.other.body;
                    body.advance(earliest, false)
                    body.center = object_collision_info.other.position
                    body.linear_velocity = object_collision_info.other.velocity
                    bodySimulationStages.delete(body)
                }
            })
            dt -= earliest;
        }
        this.pm.bodies = this.pm.bodies.filter((b) => {
            let re = this.pm.check_all_pockets(b)
            if (re.removable) {
                if (b.removal_callback) b.removal_callback()
                return false;
            }
            if (!re.captured) {
                b.center[1] = this.pm.ballCenterHeight;
                b.linear_velocity[1] = 0;
            }
            return true;
        })
    }

    mouse_hover_cuestick(e, pos, context, program_state)
    {
        let pos_ndc_near = vec4(pos[0], pos[1], -1.0, 1.0);
        let pos_ndc_far  = vec4(pos[0], pos[1],  1.0, 1.0);
        let center_ndc_near = vec4(0.0, 0.0, -1.0, 1.0);
        let P = program_state.projection_transform;
        let V = program_state.camera_inverse;
        let pos_world_near = Mat4.inverse(P.times(V)).times(pos_ndc_near);
        let pos_world_far  = Mat4.inverse(P.times(V)).times(pos_ndc_far);
        let center_world_near  = Mat4.inverse(P.times(V)).times(center_ndc_near);
        pos_world_near.scale_by(1 / pos_world_near[3]);
        pos_world_far.scale_by(1 / pos_world_far[3]);
        center_world_near.scale_by(1 / center_world_near[3]);
        
        let cuestick = pos_world_far.minus(pos_world_near);
        cuestick = pos_world_near.minus(cuestick.times(1 / cuestick[1] * (pos_world_near[1] + 5)));
        cuestick = cuestick.to3();
        let diff = cuestick.minus(this.cueball.center);
        let angle = diff.normalized().dot(vec3(0,0,1));
        this.cueball_direction = diff;
        
        angle = Math.acos(angle);
        let direction = 1;
        if (diff[0] < 0)
        {
            direction = -1
        }
        // pointing cuestick towards the direction of the mouse 
        this.cuestick_pos = Mat4.rotation(direction*angle,0,1,0)
                                            .times(Mat4.rotation(0.2, 1,0,0))
                                            .times(Mat4.translation(0,0,-12));
                            
    }

    mouse_down(e, pos, context, program_state)
    {
        this.game_state = 1;
        this.down_start = this.steps_taken;
    }

    mouse_up(e, pos, context, program_state)
    {
        this.game_state = 2;
        this.cueball_init_speed = (this.steps_taken - this.down_start) * 0.1;
    }

    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.

        //first, draw everything inherit from parent class, all the moving objects in this case
        

        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            this.children.push(new defs.Program_State_Viewer());
            program_state.set_camera(this.camera_pos);    // Locate the camera here (inverted matrix).
        }
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 1, 500);


        let t = this.t = program_state.animation_time;
        // The position of the light
        let light_position = this.light_position = Mat4.rotation(t /1500, 0, 1, 0).times(vec4(3, 6, 0, 1));
        // The color of the light
        let light_color = this.light_color = color(
            0.667 + Math.sin(t/500) / 3,
            0.667 + Math.sin(t/1500) / 3,
            0.667 + Math.sin(t/3500) / 3,
            1
        );

        // The parameters of the Light are: position, color, size
        program_state.lights = [new Light(Mat4.translation(-10, 25, -30).times(light_position), this.light_color, 1000),
                                new Light(Mat4.translation(-10, 25, 30).times(light_position), this.light_color, 1000),
                                new Light(Mat4.translation(10, 25, -30).times(light_position), this.light_color, 1000),
                                new Light(Mat4.translation(10, 25, 30).times(light_position), this.light_color, 1000)];
        // draw the point lights
        this.shapes.ball.draw(context, program_state,
                Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.translation(-10,25,-30)).times(Mat4.scale(5,5,5)),
                this.light_src.override({color: light_color}));
        this.shapes.ball.draw(context, program_state,
                Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.translation(-10,25,30)).times(Mat4.scale(5,5,5)),
                this.light_src.override({color: light_color}));
        this.shapes.ball.draw(context, program_state,
                Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.translation(10,25,-30)).times(Mat4.scale(5,5,5)),
                this.light_src.override({color: light_color}));
        this.shapes.ball.draw(context, program_state,
                Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.translation(10,25,30)).times(Mat4.scale(5,5,5)),
                this.light_src.override({color: light_color}));
       
       

        super.display(context, program_state);


        // Draw the ground:

        // Draw the backgorund
        let tf = Mat4.translation(0,-10,0).times(Mat4.scale(100,100,100));
        this.shapes.cube.draw(context, program_state, Mat4.scale(100,100,100).times(Mat4.translation(0,0.2,0)), this.materials.background);
        this.shapes.square.draw(context, program_state, Mat4.rotation(0.5*Math.PI,1,0,0).times(Mat4.scale(100,100,100)).times(Mat4.translation(0,0,0.21)), this.materials.floor_texture);
        // Draw the table
        tf = Mat4.rotation(Math.PI / 2, 0, 1, 0).times(Mat4.translation(0,-6.65,0)).times(Mat4.scale(30,30,30));
        //this.shapes.table.draw(context, program_state, tf, this.materials.table_texture);
        this.shapes.tableLeg.draw(context, program_state, Mat4.translation(0,-7,0).times(Mat4.scale(1,1,1.2)).times(tf), this.materials.table_leg_texture);
        this.shapes.outerEdge.draw(context, program_state, Mat4.translation(0,3,0).times(Mat4.scale(1,1,1.05)).times(tf), this.materials.outer_edge_texture);
        this.shapes.pocket.draw(context, program_state, Mat4.translation(0,3.4,0).times(Mat4.scale(1,1,1.04)).times(Mat4.scale(1.04,1.04,1.04)).times(tf), this.materials.pocket_texture);
        this.shapes.diamond.draw(context, program_state, Mat4.translation(0,5.,0).times(Mat4.scale(.9,.9,0.95)).times(tf), this.materials.table_leg_texture);
        this.shapes.innerEdge.draw(context, program_state, Mat4.translation(0,4.8,0).times(Mat4.scale(1,1,1.05)).times(Mat4.scale(1.01,1.01,1.01)).times(tf), this.materials.inner_edge_texture);
        this.shapes.plane.draw(context, program_state, Mat4.translation(0,-1.7,0).times(Mat4.scale(.85,.85,0.87)).times(tf), this.materials.plane_texture);
       
        // display invisible wall for testing
        const display_wall = true
        if (display_wall) {
            for (let w of this.walls_polygon) {
                w.draw(context, program_state, Mat4.identity(), this.materials.white_plastic)
            }

            for (let p of this.pm.pockets) {
                this.pockets_cylinder.draw(context, program_state, Mat4.rotation(Math.PI / 2, -1, 0, 0)
                        .times(Mat4.translation(p[0], p[2], p[1])) // translation in rotated frame
                        .times(Mat4.scale(this.pm.pocketRadius, this.pm.pocketRadius, 1)),
                    this.materials.white_plastic)
            }
        }

        // Draw the cuestick
        if (this.pm.all_bodies_static())
        {
            //console.log(this.game_state)
            // handling mouse interaction
            const mouse_position = (e, rect = canvas.getBoundingClientRect()) =>
                    vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.right - rect.left) / 2),
                        (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.top - rect.bottom) / 2));
            let canvas = context.canvas;
            var last_move = 0;
            var last_down = 0;
            var last_up = 0;
            canvas.addEventListener("mousemove", e => {
                if (Date.now() -last_move < 2000 || (this.game_state != 0 && this.game_state != 3))
                {
                    return;
                }
                last_move = Date.now();
                this.game_state = 0;

                e.preventDefault();
                this.mouse_hover_cuestick(e, mouse_position(e), context, program_state);
            });
            canvas.addEventListener("mousedown", e => {
                if (Date.now() -last_down > 200 || this.game_state == 0)
                {
                    last_down = Date.now();
                    //console.log("down")
                    this.mouse_down(e, mouse_position(e), context, program_state);
                }

            })
            canvas.addEventListener("mouseup", e => {
                if (Date.now() -last_up > 200 && this.game_state == 1)
                {
                    last_up = Date.now();
                    //console.log("up")
                    this.mouse_up(e, mouse_position(e), context, program_state);                    
                }

            })
            if (this.game_state == 1)
            {
                let a = this.steps_taken - this.down_start;
                let d = a - this.power;
                this.cuestick_pos = this.cuestick_pos.times(Mat4.translation(0,0,-d*0.1));
                this.power = a;
            }
            if (this.game_state == 2)
            {
                if (this.power < 10)
                {
                    this.power = 0;
                    this.game_state = 3;
                    this.cueball.linear_velocity = this.cueball_direction.normalized().times(this.cueball_init_speed);
                }
                else
                {
                    this.power = this.power - 10;
                }
                this.cuestick_pos = this.cuestick_pos.times(Mat4.translation(0,0,1))
            }

            tf = Mat4.translation(...this.cueball.center).times(this.cuestick_pos).times(Mat4.scale(8,8,15));
            this.shapes.cuestick.draw(context, program_state, tf, this.materials.stars);

        }
        else
        {
            let canvas = context.canvas;
            if (canvas.getAttribute('listener') == 'true')
            {
                canvas.removeEventListener("mousemove");
                canvas.removeEventListener("mousedown");
                canvas.removeEventListener("mouseup");
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

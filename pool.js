import {defs, tiny} from './src/common.js';
import {Body} from "./src/body.js";
import {Physics} from "./src/physics.js";
import {ShapesFromObject, Shape_From_File} from "./src/ShapesFromObject.js";
import {Color_Phong_Shader, Shadow_Textured_Phong_Shader,
    Depth_Texture_Shader_2D, Buffered_Texture, LIGHT_DEPTH_TEX_SIZE} from './examples/shadow-demo-shaders.js';
import {Text_Line} from './examples/text-demo.js';

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

        const shader = new defs.Fake_Bump_Map(1);

        this.materials = {
            stars: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#eeeee4"),
                ambient: .4, color_texture: this.textures.stars,
                light_depth_texture: null
            }),
            map_sat : new Material(new defs.Textured_Phong(1), {
                color: hex_color("#000000"),
                ambient: .8, diffusivity: .5, specularity: .5, texture: new Texture("assets/map-saturation.png")
            }),
            floor: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: color(1, 1, 1, 1), ambient: .3, diffusivity: 0.6, specularity: 0.4, smoothness: 64,
                color_texture: null,
                light_depth_texture: null
            }),
            // shadow pure color
            pure: new Material(new Color_Phong_Shader(), {}),
            // wall backgrounds
            backgrounds: [
                new Material(new defs.Textured_Phong(), {
                    color: hex_color("#000000"),
                    ambient: 1., texture: this.textures.club
                }),
                new Material(new defs.Textured_Phong(), {
                    color: hex_color("#000000"),
                    ambient: 1., texture: new Texture("assets/starryNight.png")
                }),
                new Material(new defs.Textured_Phong(), {
                    color: hex_color("#000000"),
                    ambient: 1., texture: new Texture("assets/space.png")
                }),
            ],
            // ball
            white_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
            red_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ff0000")}),
            green_plastic: new Material(new defs.Phong_Shader(),
                {ambient: .7, diffusivity: .3, specularity: 0, color: hex_color("#005500")}),
            // table
            table_leg_texture: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: 1, color_texture: new Texture("assets/background/table_decomposed/metalic.jpg")
            }),
            outer_edge_texture: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: .9, color_texture: new Texture("assets/background/table_decomposed/OuterEdge.png")
            }),
            pocket_texture: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .1, specularity: .5, color_texture: new Texture("assets/background/table_decomposed/PocketTexture.png")
            }),
            inner_edge_texture: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .9, specularity: .9, color_texture: new Texture("assets/background/table_decomposed/InnerEdge.png")
            }),
            plane_texture: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#002200"),
                ambient: 1., diffusivity: .8, specularity: .9, color_texture: new Texture("assets/background/table_decomposed/Plane.png"), light_depth_texture: null
            }),
            // floor
            floor_textures: [
                new Material(new defs.Textured_Phong(), {
                    color: hex_color("#000000"),
                    ambient: .7, diffusivity: .8, specularity: .9, texture: new Texture("assets/background/floor.png")
                }),
                new Material(new defs.Textured_Phong(), {
                    color: hex_color("#000000"),
                    ambient: .7, diffusivity: .8, specularity: .9, texture: new Texture("assets/background/red_carpet.png")
                }),
                new Material(new defs.Textured_Phong(), {
                    color: hex_color("#000000"),
                    ambient: .7, diffusivity: .8, specularity: .9, texture: new Texture("assets/background/blue_carpet.png")
                }),
            ],
            // logo
            bruin_texture: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: .9, color_texture: new Texture("assets/bruin.png"),
                light_depth_texture: null
            }),
            usc_texture: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: .9, color_texture: new Texture("assets/usc.png"),
                light_depth_texture: null
            }),
            glow_texture: new Material(new defs.Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1., diffusivity: .8, specularity: .9, texture: new Texture("assets/glow.png")
            }),
            // static text for score board
            static_text: new Material(new defs.Textured_Phong(1), {
                ambient: 1, diffusivity: 0, specularity: 0, texture: new Texture("assets/text.png")
            }),
        };

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
            // cue stick
            cuestick: new Shape_From_File("assets/background/cue_stick.obj"),
            // table
            pooltable: new ShapesFromObject(["assets/background/table_decomposed/TableLeg.obj",
                    "assets/background/table_decomposed/OuterEdge.obj",
                    "assets/background/table_decomposed/Pocket.obj",
                    "assets/background/table_decomposed/Diamond.obj",
                    "assets/background/table_decomposed/InnerEdge.obj",
                    "assets/background/table_decomposed/Plane.obj"],
                [this.materials.table_leg_texture,
                    this.materials.outer_edge_texture,
                    this.materials.pocket_texture,
                    this.materials.table_leg_texture,
                    this.materials.inner_edge_texture,
                    this.materials.plane_texture]),
            // static 3D texts
            congrats: new Shape_From_File("assets/background/plain_congrats.obj"),
            member1: new Shape_From_File("assets/background/member_1.obj"),
            member2: new Shape_From_File("assets/background/member_2.obj"),
            // dynamic 2D texts
            text: new Text_Line(35), // up to 5 lines
        };
        // Don't create any DOM elements to control this scene:
        this.widget_options = {make_controls: false};
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
        this.materials = Object.assign({}, this.data.materials);
        this.shapes.square = new defs.Square();
        this.collider = {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .3};
        this.camera_pos = Mat4.look_at(vec3(0,70,0), vec3(0,0,0), vec3(1,0,0));
        
        // background controllers
        this.floor_num = 0;
        this.wall_num = 0;
        this.MAX_FLOOR_NUM = 3;
        this.MAX_WALL_NUM = 3;

        // 0 = selecting direction, 1 = selecting power, 2 = firing, 3 = balls moving, 4 = cueball missing, 5 = down for cueball 
        // 
        this.game_state = 0;
        this.down_start = 0;
        this.power = 0;
        this.cueball_init_speed = 0;
        this.cueball_direction = vec3(0,0,0);

        this.last_move = 0;
        this.last_down = 0;
        this.last_up = 0;

        // players
        this.player0_score = 0;
        this.player1_score = 0;
        this.turn0 = true;
        this.turn_str = "player 0";
        this.ball_down = false;

        // shadowing
        this.shadow_pass = false;
        this.init_ok = false;
        this.show_player = false;

        // ending texts
        this.game_ended = false; // true if all 15 balls are in pockets

        // balls
        let initial_ball_position = []
        for (let i = 0; i < 5; i ++) {
            for (let j = 0; j < i + 1; j ++) {
                initial_ball_position.push([1.02 * i - 2.04 * j, -5, 17 + 1.02 * Math.sqrt(3) * i])
            }
        }
        for (let p of initial_ball_position)
        {
            this.pm.bodies.push(new Body(this.shapes.ball, this.materials.red_plastic, vec3(1,1,1), 0, 0.4, 'red')
                .emplace(Mat4.translation(...p), vec3(0, 0, 0), 0));
        }

        // cueball
        this.cueball = new Body(this.shapes.ball, this.materials.white_plastic, vec3(1,1,1), 0, 0.4, 'cueball')
            .emplace(Mat4.translation(0, -5, -17), vec3(0, 0, 0), 0)
        this.pm.bodies.push(this.cueball)
        this.cueball_in_bodies = true;

        // cuestick
        this.cuestick_pos = Mat4.rotation(0.2, 1,0,0).times(Mat4.translation(0,0,-12));

        // invisible walls to detect collision with the walls

        this.walls_polygon = this.pm.walls.map((w) => new defs.Polygon(w));
        this.pockets_cylinder = new defs.Capped_Cylinder(5, 20);

        // light source
        this.light_src = new Material(new Phong_Shader(), {
            color: color(1, 1, 1, 1), ambient: 1, diffusivity: 0, specularity: 0
        });
    }

    make_control_panel()
    {
        // scoring
        this.live_string(box => {
            box.textContent = this.turn_str + "'s turn to play"
        })
        this.new_line();
        this.live_string(box => {
            box.textContent = "UCLA: " + this.player0_score.toString() + " vs. USC: " + this.player1_score
        });
        this.new_line();
        
        // player
        this.key_triggered_button("Show player logo decoration", ["p"], () => this.show_player = !(this.show_player));
        this.new_line();
        
        // background
        this.key_triggered_button("Change ground", ["g"], () => this.floor_num = (this.floor_num + 1) % this.MAX_FLOOR_NUM);
        this.key_triggered_button("Change background wall", ["b"], () => this.wall_num = (this.wall_num + 1) % this.MAX_WALL_NUM);
        this.new_line();

        // for demo purpose ONLY
        this.key_triggered_button("Show curtain call greetings", ["c"], () => this.game_ended ^= 1);
        this.new_line();
        
        super.make_control_panel();
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
                this.removal_callback(b)
                return false;
            }
            if (!re.captured) {
                b.center[1] = this.pm.ballCenterHeight;
                b.linear_velocity[1] = 0;
            }
            return true;
        })
    }

    removal_callback(b)
    {   
        this.ball_down = true;
        let ball_type = b.type;
        if (ball_type == "cueball")
        {
            this.ball_down = false;
            this.game_state = 4;
            this.cueball_in_bodies = false;
        }
        else
        {
            if (this.turn0)
            {
                this.player0_score += 1;
            }
            else
            {
                this.player1_score += 1;
            }

            if (this.player0_score + this.player1_score == 15)
            {
                this.game_ended = true;
            }
        }
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

    mouse_hover_cueball(e, pos, context, program_state)
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

        let cueball = pos_world_far.minus(pos_world_near);
        cueball = pos_world_near.minus(cueball.times(1 / cueball[1] * (pos_world_near[1] + 5)));
        cueball = cueball.to3();
        
        cueball[0] = Math.max(cueball[0], -15.5);
        cueball[0] = Math.min(cueball[0], 15.5);
        cueball[2] = Math.max(cueball[2], -32.0);
        cueball[2] = Math.min(cueball[2], 32.0);
        
        // pointing cuestick towards the direction of the mouse
        if (this.cueball_in_bodies)
        {
            this.cueball.emplace(Mat4.translation(...cueball), vec3(0,0,0), 0);
        }
        else 
        {
            this.cueball.emplace(Mat4.translation(...cueball), vec3(0,0,0), 0);
            this.pm.bodies.push(this.cueball);
        }
    }

    mouse_down_cuestick(e, pos, context, program_state)
    {
        this.game_state = 1;
        this.down_start = this.steps_taken;
    }

    mouse_down_cueball(e, pos, context, program_state)
    {
        this.game_state = 5;
    }

    mouse_up_cuestick(e, pos, context, program_state)
    {
        this.game_state = 2;
        this.cueball_init_speed = (this.steps_taken - this.down_start) * 0.1;
    }

    mouse_up_cueball(e, pos, context, program_state)
    {
        this.game_state = 3;
    }

    // referred to: Wuyue Lu sample code in shadow-demo.js
    texture_buffer_init(gl) {
        // Depth Texture
        this.lightDepthTexture = gl.createTexture();
        // Bind it to TinyGraphics
        this.light_depth_texture = new Buffered_Texture(this.lightDepthTexture);
        this.materials.stars.light_depth_texture = this.light_depth_texture;
        this.materials.floor.light_depth_texture = this.light_depth_texture;
        this.materials.plane_texture.light_depth_texture = this.light_depth_texture;

        this.lightDepthTextureSize = LIGHT_DEPTH_TEX_SIZE;
        gl.bindTexture(gl.TEXTURE_2D, this.lightDepthTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,      // target
            0,                  // mip level
            gl.DEPTH_COMPONENT, // internal format
            this.lightDepthTextureSize,   // width
            this.lightDepthTextureSize,   // height
            0,                  // border
            gl.DEPTH_COMPONENT, // format
            gl.UNSIGNED_INT,    // type
            null);              // data
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Depth Texture Buffer
        this.lightDepthFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightDepthFramebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,       // target
            gl.DEPTH_ATTACHMENT,  // attachment point
            gl.TEXTURE_2D,        // texture target
            this.lightDepthTexture,         // texture
            0);                   // mip level
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // create a color texture of the same size as the depth texture
        // see article why this is needed_
        this.unusedTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.unusedTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.lightDepthTextureSize,
            this.lightDepthTextureSize,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // attach it to the framebuffer
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,        // target
            gl.COLOR_ATTACHMENT0,  // attachment point
            gl.TEXTURE_2D,         // texture target
            this.unusedTexture,         // texture
            0);                    // mip level
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    render_scene(context, program_state, shadow_pass, draw_light_source=false, draw_shadow=false) {
        let light_position = this.light_position;
        let light_color = this.light_color;
        const t = program_state.animation_time;
        
        program_state.draw_shadow = draw_shadow;
        
        /*
        // comment this out if we do not want light ball
        if (draw_light_source && shadow_pass) {
            this.shapes.ball.draw(context, program_state,
                Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.scale(.5,.5,.5)),
                this.light_src.override({color: light_color}));
        }
        */
        
        
        super.display(context, program_state);

        // Draw the backgorund
        let tf = Mat4.translation(0,-10,0).times(Mat4.scale(100,100,100));
        this.shapes.cube.draw(context, program_state, Mat4.scale(100,100,100).times(Mat4.translation(0,0.2,0)), this.materials.backgrounds[this.wall_num]);
        // Draw the floor
        this.shapes.square.draw(context, program_state, Mat4.rotation(0.5*Math.PI,1,0,0).times(Mat4.scale(100,100,100)).times(Mat4.translation(0,0,0.25)), this.materials.floor_textures[this.floor_num]);
        // Draw the ceiling
        this.shapes.square.draw(context, program_state, Mat4.rotation(0.5*Math.PI,1,0,0).times(Mat4.scale(100,100,100)).times(Mat4.translation(0,0,-0.9)), this.materials.floor_textures[this.floor_num]);
        

        // Draw the table
        tf = Mat4.rotation(Math.PI / 2, 0, 1, 0).times(Mat4.translation(0,-6.65,0)).times(Mat4.scale(30,30,30));
        //this.shapes.table.draw(context, program_state, tf, this.materials.table_texture);
        //this.shapes.pooltable.draw(context, program_state, tf);
        if (shadow_pass) {
            this.shapes.pooltable.draw(context, program_state, tf);
        } else {
            this.shapes.pooltable.draw(context, program_state, tf, this.materials.pure);
        }

        // display invisible wall for testing
        const display_wall = false
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
            if (this.game_state == 3 && !this.ball_down)
            {
                this.turn0 = !this.turn0;
                if (this.turn0)
                {
                    this.turn_str = "player 0";
                }
                else
                {
                    this.turn_str = "player 1";
                }
            }
            this.ball_down = false;
            // handling mouse interaction
            const mouse_position = (e, rect = canvas.getBoundingClientRect()) =>
                vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.right - rect.left) / 2),
                    (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.top - rect.bottom) / 2));
            let canvas = context.canvas;
            if (this.game_state == 3)
            {
                this.game_state = 0;
            }

            canvas.addEventListener("mousemove", e => {
                if (Date.now() -this.last_move < 100 || (this.game_state != 0 && this.game_state != 4))
                {
                    return;
                }
                this.last_move = Date.now();

                e.preventDefault();
                if (this.game_state == 0)
                {
                    this.mouse_hover_cuestick(e, mouse_position(e), context, program_state);                    
                }
                else if (this.game_state == 4)
                {
                    this.turn0 = !this.turn0;
                    this.mouse_hover_cueball(e, mouse_position(e), context, program_state);
                }
            });
            canvas.addEventListener("mousedown", e => {
                if (Date.now() - this.last_down > 500 && (this.game_state == 0 || this.game_state == 4))
                {
                    this.last_down = Date.now();
                    //console.log("down")
                    if (this.game_state == 0)
                    {
                        this.mouse_down_cuestick(e, mouse_position(e), context, program_state);
                    }
                    else if (this.game_state == 4)
                    {
                        this.mouse_down_cueball(e, mouse_position(e), context, program_state);
                    }
                }

            })
            canvas.addEventListener("mouseup", e => {
                if (Date.now() - this.last_up > 20 && (this.game_state == 1 || this.game_state == 5))
                {
                    this.last_up = Date.now();
                    //console.log("up")
                    if (this.game_state == 1)
                    {
                        this.mouse_up_cuestick(e, mouse_position(e), context, program_state);
                    }
                    else if (this.game_state == 5)
                    {
                        this.mouse_up_cueball(e, mouse_position(e), context, program_state);
                    }

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
            this.shapes.cuestick.draw(context, program_state, tf, shadow_pass ? this.materials.stars : this.materials.pure);
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
        
        // player logo decoration
        if (this.show_player) {
            let model_trans_logo_1 = Mat4.scale(3.5, 0.1, 3.5).times(Mat4.translation(0, -20, -1.2));
            let model_trans_logo_2 = Mat4.scale(3.5, 0.1, 3.5).times(Mat4.translation(0, -20, 1.2));
            this.shapes.cube.draw(context, program_state, model_trans_logo_1, shadow_pass ? this.materials.bruin_texture : this.materials.pure);
            this.shapes.cube.draw(context, program_state, model_trans_logo_2, shadow_pass ? this.materials.usc_texture : this.materials.pure);
        }
        
        // glow effect to show which player is playing
        let player_logo = Mat4.scale(2, 0.1, 2).times(Mat4.translation(13, -6.65, -18));
        let glow_transformation = Mat4.scale(4.5, 0.1, 4.5).times(Mat4.translation(5.8, -9, -8)).times(Mat4.rotation(0.5 * Math.PI, 1, 0, 0));
        this.shapes.square.draw(context, program_state, this.turn0 ? glow_transformation : glow_transformation.times(Mat4.translation(0,10.65,0)), this.materials.glow_texture);
        this.shapes.cube.draw(context, program_state, player_logo, this.materials.bruin_texture);
        this.shapes.cube.draw(context, program_state, player_logo.times(Mat4.translation(0, 0, 24)), this.materials.usc_texture);
        
        // score board
        const score_string = "UCLA: " + this.player0_score + " v.s. USC: " + this.player1_score;
        let score_tranformation = Mat4.identity();
        score_tranformation = score_tranformation
                                .times(Mat4.translation(26, -0.5, -32))
                                .times(Mat4.rotation(-Math.PI * 0.5, 1, 0, 0))
                                .times(Mat4.rotation(-Math.PI * 0.5, 0, 0, 1))
                                .times(Mat4.scale(1.5, 1.5, 1.5));
        this.shapes.text.set_string(score_string, context.context);
        this.shapes.text.draw(context, program_state, score_tranformation, this.materials.static_text);

        // show ending texts upon either player hit all balls (simplified rule?)
        // this.player0_score + this.player1_score == 15 
        let text_tranformation = Mat4.identity();
        text_tranformation = text_tranformation
                                .times(Mat4.translation(0, 20, 0))
                                .times(Mat4.rotation(-Math.PI * 0.5, 1, 0, 0))
                                .times(Mat4.rotation(-Math.PI * 0.5, 0, 0, 1))
                                .times(Mat4.scale(5.0 + 1.0 * Math.sin( t / 1000 ),5.0 + 1.0 * Math.sin( t / 1000 ), 5.0 + 1.0 * Math.sin( t / 1000 )));
        if(this.game_ended){
            this.shapes.congrats.draw(context, program_state, text_tranformation.times(Mat4.translation(-0.2, 1., 0.)).times(Mat4.scale(2,2,2)), this.materials.white_plastic);
            this.shapes.member1.draw(context, program_state, text_tranformation.times(Mat4.translation(0.8, 0., 0.)), this.materials.white_plastic);
            this.shapes.member2.draw(context, program_state, text_tranformation.times(Mat4.translation(1.2, -1., 0.)).times(Mat4.scale(1.2, 1.2, 1.2)), this.materials.white_plastic); 
        }
    }

    display(context, program_state) {
        const gl = context.context;
        if (!this.init_ok) {
            const ext = gl.getExtension('WEBGL_depth_texture');
            if (!ext) {
                return alert('need WEBGL_depth_texture');  // eslint-disable-line
            }
            this.texture_buffer_init(gl);

            this.init_ok = true;
        }

        //first, draw everything inherit from parent class, all the moving objects in this case
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            this.children.push(new defs.Program_State_Viewer());
            program_state.set_camera(this.camera_pos);    // Locate the camera here (inverted matrix).
            /*
            program_state.set_camera(Mat4.look_at(
                vec3(0, 12, 12),
                vec3(0, 2, 0),
                vec3(0, 1, 0)
            ));*/
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
        this.light_view_target = vec4(0, 0, 0, 1);
        this.light_field_of_view = 130 * Math.PI / 180; // 130 degree

        program_state.lights = [new Light(this.light_position, this.light_color, 1000)];

        const light_view_mat = Mat4.look_at(
            vec3(this.light_position[0], this.light_position[1], this.light_position[2]),
            vec3(this.light_view_target[0], this.light_view_target[1], this.light_view_target[2]),
            vec3(0, 1, 0), // assume the light to target will have a up dir of +y, maybe need to change according to your case
        );
        const light_proj_mat = Mat4.perspective(this.light_field_of_view, 1, 0.5, 500);
        /*
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
        */
        // Bind the Depth Texture Buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightDepthFramebuffer);
        gl.viewport(0, 0, this.lightDepthTextureSize, this.lightDepthTextureSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Prepare uniforms
        program_state.light_view_mat = light_view_mat;
        program_state.light_proj_mat = light_proj_mat;
        program_state.light_tex_mat = light_proj_mat;
        program_state.view_mat = light_view_mat;
        program_state.projection_transform = light_proj_mat;
        this.render_scene(context, program_state, false,false, false);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        program_state.view_mat = program_state.camera_inverse;
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);
        this.render_scene(context, program_state, true,true, true);
        
        
        
        
        
        

    }

}

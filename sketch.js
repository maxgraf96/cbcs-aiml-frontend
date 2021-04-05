let htmlCanvas;

// Sensor stuff
let forceX, forceY;
let px = 50; // Position x and y
let py = 50;
let vx = 0.0; // Velocity x and y
let vy = 0.0;
var updateRate = 1/60; // Sensor refresh rate

// Socket.io stuff
let socket;

// Recording stuff
let mic, recorder, soundFile;

// UI
WIDTH = document.documentElement.clientWidth;
HEIGHT = document.documentElement.clientHeight;

let button;

let radius = 90;

// State management
// Flag to limit the update rate of the motion sensor (and thereby the OSC message send rate)
let isMotionReady = true;
// Currently playing the trajectory
let isLooping = 0;
// Curently recording
let recordingState = 0;
// Since phone mics are pretty bad this is currently set to true to just toggle a recording on the hosting machine
// Can be set to false to use the phone mic instead (this transmits audio to JUCE via OSC)
const RECORD_ON_SERVER = true;

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContext();

let SAMPLE_RATE = audioContext.sampleRate;
const GRAIN_LENGTH = 4096;
const GRAINS_IN_TRAJECTORY = 33;
let TRAJECTORY_LENGTH_S = GRAIN_LENGTH * GRAINS_IN_TRAJECTORY / SAMPLE_RATE;

function setup() {
    // Get height from main container
    let container = select(".container");
    HEIGHT = window.innerHeight - container.height;
    let canv = createCanvas(WIDTH, HEIGHT);
    canv.id("myCanvas");

     // = document.getElementById("defaultCanvas0");
    htmlCanvas = document.getElementById("myCanvas");

    // Add canvas listeners
    addCanvasListeners();

    // Set frame rate
    frameRate(30);

    getAccel();

    // Connect to socket.io to send OSC messages
    // Automagical connection works on local network, specifying ip+port doesn't work for some reason...
    socket = io.connect(); // connect to server

    if(!RECORD_ON_SERVER){
        // Setup recording
        // create an audio in
        mic = new p5.AudioIn();
        // prompts user to enable their browser mic
        mic.start();
        // create a sound recorder
        recorder = new p5.SoundRecorder();
        // connect the mic to the recorder
        recorder.setInput(mic);
        // this sound file will be used to
        // playback & save the recording
        soundFile = new p5.SoundFile();
    }
}

function draw() {
    stroke("#f5f6fa");
    fill("#000");

    background("#000");

   if(isLooping === 1) {
        fill("#00CA4E");
    }

    ellipse(px, py, radius, radius);
}

function record(){
    // ensure audio is enabled
    userStartAudio();

    if(recordingState === 0){
        // Update UI and state
        initProgressBar();
        recordingState++;
        // Record
        if(RECORD_ON_SERVER) {
            socket.emit('oscMessageRecordInJUCE', {});
            sleep(TRAJECTORY_LENGTH_S * 1000).then(() => {
                select('#myProgress').style("display", "none");
                recordingState--;
            });
        } else {
            if(mic.enabled){
                // Send recording message to JUCE
                socket.emit('oscMessageClearBuffer', {});

                // record to our p5.SoundFile
                recorder.record(soundFile, TRAJECTORY_LENGTH_S, () => {
                    // stop recorder and
                    // send result to soundFile
                    recorder.stop();

                    // Send sound to JUCE
                    let soundBlob = soundFile.getBlob();

                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const srcBuffer = e.target.result;

                        audioContext.decodeAudioData(srcBuffer, async (buffer) => {
                            // Send channel data via OSC
                            let leftData = buffer.getChannelData(0);
                            let rightData = buffer.getChannelData(1);

                            socket.emit('oscMessageAudioData', 0, 0, leftData.buffer, async (response) => {
                                await sleep(100);
                                socket.emit('oscMessageAudioData', 1, 0, rightData.buffer, async (response) => {
                                    await sleep(500);
                                    socket.emit('oscMessageAudioTransmissionDone', {});
                                });
                            });
                        });
                    };
                    reader.readAsArrayBuffer(soundBlob);
                    // Hide recording UI
                    select('#myProgress').style("display", "none");
                    recordingState--;
                });

            }
        }
    }
}

// Helper functions
function addCanvasListeners() {
    htmlCanvas.addEventListener("mousedown", function (e) {
        isLooping = 1;
        socket.emit('oscMessageLooping', { value:  isLooping}); // raise an event on the server
    }, false);
    htmlCanvas.addEventListener("mouseup", function (e) {
        isLooping = 0;
        socket.emit('oscMessageLooping', { value:  isLooping}); // raise an event on the server
    }, false);

    htmlCanvas.addEventListener("touchstart", function (e) {
        let mouseEvent = new MouseEvent("mousedown", {});
        htmlCanvas.dispatchEvent(mouseEvent);
    }, false);
    htmlCanvas.addEventListener("touchend", function (e) {
        var mouseEvent = new MouseEvent("mouseup", {});
        htmlCanvas.dispatchEvent(mouseEvent);
    }, false);

    document.body.addEventListener("touchstart", function (e) {
        if (e.target === htmlCanvas) {
            e.preventDefault();
        }
    }, false);
    document.body.addEventListener("touchend", function (e) {
        if (e.target === htmlCanvas) {
            e.preventDefault();
        }
    }, false);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let progress = 0;
function initProgressBar(){
    select('#myProgress').style("display", "block");
    let update = TRAJECTORY_LENGTH_S * 1000 / 100;
    if (progress === 0) {
        progress = 1;
        let elem = document.getElementById("myBar");
        let width = 1;
        let id = setInterval(frame, update);
        function frame() {
            if (width >= 100) {
                clearInterval(id);
                progress = 0;
            } else {
                width++;
                elem.style.width = width + "%";
            }
        }
    }
}

Number.prototype.map = function (in_min, in_max, out_min, out_max) {
    return (this - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max);
};

function playOSC(){
    socket.emit('oscMessagePlay', {});
}

function agentFeedback(feedback){
    socket.emit('oscMessageAgentFeedback', {feedback: feedback});
}

function agentZoneFeedback(feedback){
    socket.emit('oscMessageAgentZoneFeedback', {feedback: feedback});
}

let isAgentPaused = true;
function toggleAgent(){
    isAgentPaused = !isAgentPaused;
    socket.emit('oscMessagePauseAgent', {isAgentPaused: isAgentPaused === true ? 1 : 0});

    // Running
    if(!isAgentPaused){
        select('#toggleAgentButton').style("background-color", "#2ecc71");
        select('#toggleAgentButton').html("Agent running...");
    } else { // Paused
        select('#toggleAgentButton').style("background-color", "#000");
        select('#toggleAgentButton').html("Run agent");
    }
}

function explore(){
    socket.emit('oscMessageExplore', {});
}

function getAccel(){
    DeviceMotionEvent.requestPermission().then(response => {
        if (response == 'granted') {
            // Add a listener to get smartphone orientation
            // in the alpha-beta-gamma axes (units in degrees)
            window.addEventListener('deviceorientation',async (event) => {
                if(!isMotionReady)
                    return;
                // Expose each orientation angle in a more readable way
                // rotation_degrees = event.alpha;
                frontToBack_degrees = event.beta;
                // leftToRight_degrees = event.gamma;

                // forceX = event.gamma;
                forceY = event.beta;

                // Update velocity according to how tilted the phone is
                // Since phones are narrower than they are long, double the increase to the x velocity
                // vx = vx + leftToRight_degrees * updateRate*2;
                vy = vy + frontToBack_degrees * updateRate;

                // Update position and clip it to bounds
                // Fix px
                px = WIDTH / 2;

                let minY = -30;
                let maxY = 30;

                py = forceY.map(minY, maxY, 0, HEIGHT);
                if (py > HEIGHT || py < 0){
                    py = Math.max(0, Math.min(HEIGHT, py)) // Clip py between 0-98
                    vy = 0;
                }

                // Send accelerometer data (mapped to [0...1] to OSC)
                let value = forceY.map(minY, maxY, 0, 1);
                // Clamp value since forceY may be less than -20 and more than 20
                value = value.clamp(0, 1);
                socket.emit('oscMessage', { value:  value}); // raise an event on the server
                isMotionReady = false;

                await sleep(10).then(() => {
                    isMotionReady = true;
                });
            });
        }
    });
}

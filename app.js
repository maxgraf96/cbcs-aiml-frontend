'use strict'
const https = require('https')
const path = require('path')
const fs = require('fs')
const osc = require("osc");

// Dummy osc listener port (needed to send osc messages)
var udpPort = new osc.UDPPort({
    localAddress: "127.0.0.1",
    localPort: 57121,
    metadata: true
});
udpPort.open();

// Server port
const port = 4000;

// This osc port goes to the backend (JUCE)
const OSC_RECEIVER_PORT = 12000;

// Local private key and certificate for hosting over HTTPS locally
const privateKey = fs.readFileSync('key.pem', 'utf8')
const certificate = fs.readFileSync('cert.pem', 'utf8')

// Create credentials object
const credentials = { key: privateKey, cert: certificate }

const httpsServer = https.createServer(credentials, handleRequest)

const io = require('socket.io')(httpsServer);
io.on('connection', client => {
    client.on('oscMessage', data => {
        udpPort.send({
            address: "/osc_from_js",
            args: [
                {
                    type: "f",
                    value: data.value
                }
            ]
        }, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessageLooping', data => {
        udpPort.send({
            address: "/osc_from_js_is_looping",
            args: [
                {
                    type: "i",
                    value: data.value
                }
            ]
        }, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessageAudioData', async (channel, bufferIdx, channelBuffer, callback) => {
        let oscSizeLimit = 100;
        let args = []

        let address = channel === 0 ? "/osc_from_js_left_channel_data" : "/osc_from_js_right_channel_data";

        let data = new Float32Array(channelBuffer.buffer);
        // push index
        args.push({
            type: "i",
            value: bufferIdx
        })
        while(bufferIdx < data.length) {
            args.push({
                type: "f",
                value: data[bufferIdx++]
            })
            if(bufferIdx % oscSizeLimit === 0){
                // Send message
                udpPort.send({
                    address: address,
                    args: args
                }, "127.0.0.1", OSC_RECEIVER_PORT);
                await sleep(1);
                // Reset args
                args.length = 0;
                args.push({
                    type: "i",
                    value: bufferIdx
                })
            }
        }
        callback({
            status: "ok"
        });
    });
    client.on('oscMessageAudioTransmissionDone', data => {
        udpPort.send({
            address: "/osc_from_js_audio_transmission_done",
            args: [
                {
                    type: "i",
                    value: data.value
                }
            ]
        }, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessageClearBuffer', data => {
        udpPort.send({address: "/osc_from_js_clear_recording_buffer", args: []}, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessagePlay', data => {
        udpPort.send({address: "/osc_from_js_play", args: []}, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessageAgentFeedback', data => {
        udpPort.send({address: "/osc_from_js_agent_feedback", args: [{
            type: "i", value: data.feedback
            }]}, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessageAgentZoneFeedback', data => {
        udpPort.send({address: "/osc_from_js_agent_zone_feedback", args: [{
                type: "i", value: data.feedback
            }]}, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessagePauseAgent', data => {
        udpPort.send({address: "/osc_from_js_pause_agent", args: [{
                type: "i", value: data.isAgentPaused
            }]}, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessageRecordInJUCE', data => {
        udpPort.send({address: "/osc_from_js_record_in_JUCE", args: []}, "127.0.0.1", OSC_RECEIVER_PORT);
    });
    client.on('oscMessageExplore', data => {
        udpPort.send({address: "/osc_from_js_explore", args: []}, "127.0.0.1", OSC_RECEIVER_PORT);
    });
});

httpsServer.listen(port);


function handleRequest(req, res) {
    // What did we request?
    let pathname = req.url;

    // If blank let's ask for index.html
    if (pathname == '/') {
        pathname = '/index.html';
    }

    // Ok what's our file extension
    let ext = path.extname(pathname);

    // Map extension to file type
    const typeExt = {
        '.html': 'text/html',
        '.js':   'text/javascript',
        '.css':  'text/css'
    };

    // What is it?  Default to plain text
    let contentType = typeExt[ext] || 'text/plain';

    // Now read and write back the file with the appropriate content type
    fs.readFile(__dirname + pathname,
        function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading ' + pathname);
            }
            // Dynamically setting content type
            res.writeHead(200,{
                'Content-Type': contentType ,
                'Access-Control-Allow-Origin': 'https://192.168.1.100:4000',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, PATCH, DELETE',
                'Access-Control-Allow-Headers': 'X-Requested-With,content-type',
                'Access-Control-Allow-Credentials': true
            });

            // Website you wish to allow to connect
            // res.writeHead('Access-Control-Allow-Origin', 'https://192.168.1.100:4000');
            // res.writeHead('Access-Control-Allow-Origin', 'http://192.168.1.100:4000');
            // // Request methods you wish to allow
            // res.writeHead('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
            // // Request headers you wish to allow
            // res.writeHead('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
            // // Set to true if you need the website to include cookies in the requests sent
            // // to the API (e.g. in case you use sessions)
            // res.writeHead('Access-Control-Allow-Credentials', true);

            res.end(data);
        }
    );
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
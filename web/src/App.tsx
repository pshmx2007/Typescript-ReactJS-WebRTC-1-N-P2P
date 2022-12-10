import React, { useState, useRef, useEffect, useCallback } from 'react';
import Video from './Components/Video';
import { WebRTCUser } from './types';
import {v4 as uuidv4} from 'uuid';
import { createModifiersFromModifierFlags } from 'typescript';

const pc_config = {
	iceServers: [
		// {
		//   urls: 'stun:[STUN_IP]:[PORT]',
		//   'credentials': '[YOR CREDENTIALS]',
		//   'username': '[USERNAME]'
		// },
		{
			urls: 'stun:stun.l.google.com:19302',
		},
	],
};

const App = () => {
	const socketRef = useRef<SocketIOClient.Socket>();
	const pcsRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
	const localVideoRef = useRef<HTMLVideoElement>(null);
	const localStreamRef = useRef<MediaStream>();
	const [users, setUsers] = useState<WebRTCUser[]>([]);
	const myUUID = uuidv4();

	const emit = (event: String, data: any, socket: WebSocket) => {
		const aliveData = {
			traceId: myUUID.toString(),
			from: myUUID.toString(),
			event: event,
			content: data
		  };
		console.log('[emit]', aliveData)
		socket?.send(JSON.stringify(aliveData));
	}
	const sendEventToSocket = (event: String, socket: WebSocket) => {
		console.log('[sendEventToSocket] ', event);
		emit(event, "", socket);
	}

	const getCandidate = async (data: { candidate: RTCIceCandidateInit; candidateSendID: string }) => {
		const { candidate, candidateSendID } = data;
		console.log('get candidate', candidateSendID, pcsRef);
		const pc: RTCPeerConnection = pcsRef.current[candidateSendID];
		if (!pc) return;
		await pc.addIceCandidate(new RTCIceCandidate(candidate));
		console.log('candidate add success');
	}

	const createOffer = async (socket: WebSocket) => {
		if (!localStreamRef.current) return;
		const pc = createPeerConnection(myUUID.toString(), socket);
		if (!(pc)) return;
		pcsRef.current = { ...pcsRef.current, [myUUID.toString()]: pc };
		try {
			const localSdp = await pc.createOffer({
				offerToReceiveAudio: true,
				offerToReceiveVideo: true,
			});
			console.log('create offer success');
			await pc.setLocalDescription(new RTCSessionDescription(localSdp));
			emit("message", localSdp, socket);
		} catch (e) {
			console.error(e);
		}
	}

	// const getOffer = async (data: {
	// 	sdp: RTCSessionDescription;
	// 	offerSendID: string;
	// 	offerSendEmail: string;
	// }) => {
	// 	const { sdp, offerSendID, offerSendEmail } = data;
	// 	console.log('get offer');
	// 	if (!localStreamRef.current) return;
	// 	const pc = createPeerConnection(offerSendID, offerSendEmail);
	// 	if (!(pc && socketRef.current)) return;
	// 	pcsRef.current = { ...pcsRef.current, [offerSendID]: pc };
	// 	try {
	// 		await pc.setRemoteDescription(new RTCSessionDescription(sdp));
	// 		console.log('answer set remote description success');
	// 		const localSdp = await pc.createAnswer({
	// 			offerToReceiveVideo: true,
	// 			offerToReceiveAudio: true,
	// 		});
	// 		await pc.setLocalDescription(new RTCSessionDescription(localSdp));
	// 		socketRef.current.emit('answer', {
	// 			sdp: localSdp,
	// 			answerSendID: socketRef.current.id,
	// 			answerReceiveID: offerSendID,
	// 		});
	// 	} catch (e) {
	// 		console.error(e);
	// 	}
	// }

	const getAnswer = (
		data: { sdp: RTCSessionDescription; answerSendID: string }) => {
		const { sdp, answerSendID } = data;
		// console.log('get answer', sdp, answerSendID);
		const pc: RTCPeerConnection = pcsRef.current[answerSendID];
		if (!pc) return;
		pc.setRemoteDescription(new RTCSessionDescription(sdp));
	}

	useEffect(() => {
		getLocalStream();

		let webSocket = new WebSocket(`ws://localhost:8080/chatt`)
		
		webSocket.onopen = () => {
		  console.log('[Connection Manager] Socket Open');
		  try {
			const aliveData = {
				traceId: myUUID.toString(),
				from: myUUID.toString(),
				event: 'join',
				content: {
					token: "teacher",
					password: "123456",
					skin: "None"
				},
			  };
			webSocket?.send(JSON.stringify(aliveData));
		  } catch (e) {
			console.log('[Connection Manager] Socket send error', e);
		  }
		};
		webSocket.onmessage = (event) => {
			let msg = JSON.parse(event.data);
			let data = msg.content;
			switch (msg.event) {
				case 'matched':
					// onMatched
					if (data.offer) {
						createOffer(webSocket);
					}
        			break;
				
				case 'message':
					// onMessage
					console.log('[onMessage] ', msg);
					if (msg.content.type === 'answer') {
						// get Answer 
						console.log('[onMessage:Answer] ', msg);
						const answerData = {
							sdp: msg.content.sdp,
							answerSendID: msg.from.toString(),
						}
						getAnswer(answerData);
					}
					else if (msg.content.type === 'candidate') {
						console.log('[onMessage:candidate] ', msg);
						const candidateData = {
							candidate: msg.content.candidate,
							candidateSendID: msg.from.toString(),
						}
						getCandidate(candidateData);
					}
					break;
				default:
					console.log('[Server Msg] ', msg);
			}
		};
		webSocket.onclose = (event) => {
		  console.log('[Connection Manager] Socket Close Code', event.code);
		  if (event.code === 4000) {
			return;
		  }
		  setTimeout(() => {
			console.log('----- [Connection Manager] Socket Reconnect');		
			webSocket = new WebSocket(`ws://localhost:8080/chatt`)
		  }, 3000);
		};
		webSocket.onerror = (e) => {;
		  webSocket.close();
		};
	
		return () => {
		  webSocket.close(4000, 'reset');
		};
	  }, []);

	const getLocalStream = useCallback(async () => {
		try {
			const localStream = await navigator.mediaDevices.getDisplayMedia({
				audio: true,
				video: {
					width: 240,
					height: 240,
				},
			});
			localStreamRef.current = localStream;
			if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
		} catch (e) {
			console.log(`getUserMedia error: ${e}`);
		}
	}, []);

	const createPeerConnection = useCallback((uuid: string, socket: WebSocket) => {
		try {
			const pc = new RTCPeerConnection(pc_config);

			pc.onicecandidate = (e) => {
				console.log('[onIceCandidate]', e);
				if (!e.candidate) return;
				const candidateData = {
					type: 'candidate',
					candidate: e.candidate.candidate,	
					id: e.candidate.sdpMid,
					label: e.candidate.sdpMLineIndex,
				}
				emit("message", candidateData, socket);
			};

			pc.oniceconnectionstatechange = (e) => {
				console.log(e);
			};

			pc.ontrack = (e) => {
				console.log('ontrack success');
				setUsers((oldUsers) =>
					oldUsers
						.filter((user) => user.id !== uuid)
						.concat({
							id: uuid,
							uuid,
							stream: e.streams[0],
						}),
				);
			};

			if (localStreamRef.current) {
				console.log('localstream add');
				localStreamRef.current.getTracks().forEach((track) => {
					if (!localStreamRef.current) return;
					pc.addTrack(track, localStreamRef.current);
				});
			} else {
				console.log('no local stream');
			}

			return pc;
		} catch (e) {
			console.error(e);
			return undefined;
		}
	}, []);

	// useEffect(() => {

	// 	// getLocalStream();

	// 	// socketRef.current.on('all_users', (allUsers: Array<{ id: string; email: string }>) => {
	// 	// 	allUsers.forEach(async (user) => {
	// 	// 		if (!localStreamRef.current) return;
	// 	// 		const pc = createPeerConnection(user.id, user.email);
	// 	// 		if (!(pc && socketRef.current)) return;
	// 	// 		pcsRef.current = { ...pcsRef.current, [user.id]: pc };
	// 	// 		try {
	// 	// 			const localSdp = await pc.createOffer({
	// 	// 				offerToReceiveAudio: true,
	// 	// 				offerToReceiveVideo: true,
	// 	// 			});
	// 	// 			console.log('create offer success');
	// 	// 			await pc.setLocalDescription(new RTCSessionDescription(localSdp));
	// 	// 			socketRef.current.emit('offer', {
	// 	// 				sdp: localSdp,
	// 	// 				offerSendID: socketRef.current.id,
	// 	// 				offerSendEmail: 'offerSendSample@sample.com',
	// 	// 				offerReceiveID: user.id,
	// 	// 			});
	// 	// 		} catch (e) {
	// 	// 			console.error(e);
	// 	// 		}
	// 	// 	});
	// 	// });

	// 	// socketRef.current.on(
	// 	// 	'getOffer',
	// 	// 	async (data: {
	// 	// 		sdp: RTCSessionDescription;
	// 	// 		offerSendID: string;
	// 	// 		offerSendEmail: string;
	// 	// 	}) => {
	// 	// 		const { sdp, offerSendID, offerSendEmail } = data;
	// 	// 		console.log('get offer');
	// 	// 		if (!localStreamRef.current) return;
	// 	// 		const pc = createPeerConnection(offerSendID, offerSendEmail);
	// 	// 		if (!(pc && socketRef.current)) return;
	// 	// 		pcsRef.current = { ...pcsRef.current, [offerSendID]: pc };
	// 	// 		try {
	// 	// 			await pc.setRemoteDescription(new RTCSessionDescription(sdp));
	// 	// 			console.log('answer set remote description success');
	// 	// 			const localSdp = await pc.createAnswer({
	// 	// 				offerToReceiveVideo: true,
	// 	// 				offerToReceiveAudio: true,
	// 	// 			});
	// 	// 			await pc.setLocalDescription(new RTCSessionDescription(localSdp));
	// 	// 			socketRef.current.emit('answer', {
	// 	// 				sdp: localSdp,
	// 	// 				answerSendID: socketRef.current.id,
	// 	// 				answerReceiveID: offerSendID,
	// 	// 			});
	// 	// 		} catch (e) {
	// 	// 			console.error(e);
	// 	// 		}
	// 	// 	},
	// 	// );

	// 	// socketRef.current.on(
	// 	// 	'getAnswer',
	// 	// 	(data: { sdp: RTCSessionDescription; answerSendID: string }) => {
	// 	// 		const { sdp, answerSendID } = data;
	// 	// 		console.log('get answer');
	// 	// 		const pc: RTCPeerConnection = pcsRef.current[answerSendID];
	// 	// 		if (!pc) return;
	// 	// 		pc.setRemoteDescription(new RTCSessionDescription(sdp));
	// 	// 	},
	// 	// );

	// 	// socketRef.current.on(
	// 	// 	'getCandidate',
	// 	// 	async (data: { candidate: RTCIceCandidateInit; candidateSendID: string }) => {
	// 	// 		console.log('get candidate');
	// 	// 		const pc: RTCPeerConnection = pcsRef.current[data.candidateSendID];
	// 	// 		if (!pc) return;
	// 	// 		await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
	// 	// 		console.log('candidate add success');
	// 	// 	},
	// 	// );

	// 	// socketRef.current.on('user_exit', (data: { id: string }) => {
	// 	// 	if (!pcsRef.current[data.id]) return;
	// 	// 	pcsRef.current[data.id].close();
	// 	// 	delete pcsRef.current[data.id];
	// 	// 	setUsers((oldUsers) => oldUsers.filter((user) => user.id !== data.id));
	// 	// });

	// 	return () => {
	// 		if (socketRef.current) {
	// 			socketRef.current.disconnect();
	// 		}
	// 		users.forEach((user) => {
	// 			if (!pcsRef.current[user.id]) return;
	// 			pcsRef.current[user.id].close();
	// 			delete pcsRef.current[user.id];
	// 		});
	// 	};
	// 	// eslint-disable-next-line react-hooks/exhaustive-deps
	// }, [createPeerConnection, getLocalStream]);

	return (
		<div>
			<video
				style={{
					width: 240,
					height: 240,
					margin: 5,
					backgroundColor: 'black',
				}}
				muted
				ref={localVideoRef}
				autoPlay
			/>
			{users.map((user, index) => (
				<Video key={index} uuid={user.uuid} stream={user.stream} />
			))}
		</div>
	);
};

export default App;

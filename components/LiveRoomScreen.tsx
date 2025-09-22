import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, LiveAudioRoom, LiveAudioRoomMessage, User } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../i18n';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { AGORA_APP_ID } from '../constants';

interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
  onNavigate: (view: AppView, props?: any) => void;
  onSetTtsMessage: (message: string) => void;
}

const SpeakerIcon: React.FC<{ user: User; isHost: boolean; isSpeaking: boolean; onClick: () => void }> = ({ user, isHost, isSpeaking, onClick }) => (
    <button onClick={onClick} className="flex flex-col items-center gap-2 w-24 text-center">
        <div className="relative">
            <img src={user.avatarUrl} alt={user.name} className={`w-20 h-20 rounded-full transition-all duration-200 ${isSpeaking ? 'ring-4 ring-green-400' : 'ring-2 ring-slate-600'}`} />
            {isHost && <div className="absolute -bottom-1 -right-1 bg-amber-400 text-black text-xs p-1 rounded-full">👑</div>}
        </div>
        <p className="font-semibold text-sm truncate w-full">{user.name}</p>
    </button>
);

const ListenerIcon: React.FC<{ user: User; onClick: () => void }> = ({ user, onClick }) => (
    <button onClick={onClick}>
        <img src={user.avatarUrl} alt={user.name} title={user.name} className="w-12 h-12 rounded-full ring-2 ring-slate-700" />
    </button>
);

const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onGoBack, onNavigate, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [messages, setMessages] = useState<LiveAudioRoomMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMuted, setIsMuted] = useState(true);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState('');

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const { language } = useSettings();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const isHost = room?.host.id === currentUser.id;
    const isSpeaker = room?.speakers.some(s => s.id === currentUser.id);

    // Agora Lifecycle
    useEffect(() => {
        if (!AGORA_APP_ID) {
            onSetTtsMessage("Agora App ID is not configured. Real-time audio will not work.");
            onGoBack();
            return;
        }

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.current = client;

        const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio') {
                user.audioTrack?.play();
            }
        };

        const handleVolumeIndicator = (volumes: any[]) => {
            if (volumes.length === 0) return;
            const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max);
            if (mainSpeaker.level > 5) {
                setActiveSpeakerId(mainSpeaker.uid.toString());
            } else {
                setActiveSpeakerId(null);
            }
        };

        const joinAndPublish = async () => {
            try {
                client.on('user-published', handleUserPublished);
                client.enableAudioVolumeIndicator();
                client.on('volume-indicator', handleVolumeIndicator);

                const token = await geminiService.getAgoraToken(roomId, currentUser.id);
                if (!token) throw new Error("Failed to get Agora token.");
                await client.join(AGORA_APP_ID, roomId, token, currentUser.id);

                if (isSpeaker) {
                    const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                    localAudioTrack.current = audioTrack;
                    await audioTrack.setMuted(isMuted);
                    await client.publish([audioTrack]);
                }
            } catch (error: any) {
                console.error("Agora setup failed:", error);
                onSetTtsMessage("Could not connect to audio room.");
                onGoBack();
            }
        };
        
        geminiService.joinLiveAudioRoom(currentUser.id, roomId).then(joinAndPublish);

        return () => {
            client.off('user-published', handleUserPublished);
            client.off('volume-indicator', handleVolumeIndicator);
            localAudioTrack.current?.stop();
            localAudioTrack.current?.close();
            client.leave();
            geminiService.leaveLiveAudioRoom(currentUser.id, roomId);
        };
    }, [roomId, currentUser.id, isSpeaker, onGoBack, onSetTtsMessage]); // Re-run if speaker status changes

    // Firestore listeners for room & messages
    useEffect(() => {
        setIsLoading(true);
        const unsubRoom = geminiService.listenToAudioRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                setRoom(roomDetails);
            } else {
                onGoBack();
            }
            setIsLoading(false);
        });

        const unsubMessages = geminiService.listenToLiveAudioRoomMessages(roomId, setMessages);

        return () => {
            unsubRoom();
            unsubMessages();
        };
    }, [roomId, onGoBack]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleLeave = () => {
        if (isHost) {
            if (window.confirm("As the host, leaving will end the room for everyone. Are you sure?")) {
                geminiService.endLiveAudioRoom(currentUser.id, roomId);
            }
        } else {
            onGoBack();
        }
    };
    
    const handleToggleMute = async () => {
        if (!isSpeaker || !localAudioTrack.current) return;
        const newMutedState = !isMuted;
        await localAudioTrack.current.setMuted(newMutedState);
        setIsMuted(newMutedState);
    };

    const handleRaiseHand = () => {
        geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
    };
    
    const handleInviteToSpeak = (userId: string) => {
        if (isHost) {
            geminiService.inviteToSpeakInAudioRoom(currentUser.id, userId, roomId);
        }
    };
    
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !room) return;
        await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, newMessage, isHost, isSpeaker || false);
        setNewMessage('');
    };
    
    const handleReactToMessage = (messageId: string, emoji: string) => {
        geminiService.reactToLiveAudioRoomMessage(roomId, messageId, currentUser.id, emoji);
    };

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }

    const raisedHandUsers = room.listeners.filter(l => room.raisedHands.includes(l.id));

    return (
        <div className="h-full w-full flex flex-col bg-slate-900 text-white">
            <header className="flex-shrink-0 p-4 flex justify-between items-center bg-black/20">
                <div>
                    <h1 className="text-xl font-bold truncate">{room.topic}</h1>
                    <button onClick={() => onNavigate(AppView.ROOM_PARTICIPANTS, { roomId })} className="text-sm text-slate-400 hover:underline">
                        {room.speakers.length + room.listeners.length} participant(s)
                    </button>
                </div>
                <button onClick={handleLeave} className="bg-red-600 hover:bg-red-500 font-bold py-2 px-4 rounded-lg">
                    Leave
                </button>
            </header>

            <main className="flex-grow p-4 space-y-6 overflow-y-auto">
                <section>
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">Speakers</h2>
                    <div className="flex flex-wrap gap-4">
                        {room.speakers.map(s => <SpeakerIcon key={s.id} user={s} isHost={s.id === room.host.id} isSpeaking={s.id === activeSpeakerId} onClick={() => onNavigate(AppView.PROFILE, { username: s.username })} />)}
                    </div>
                </section>
                {raisedHandUsers.length > 0 && isHost && (
                    <section>
                        <h2 className="text-lg font-semibold text-slate-300 mb-4">Raised Hands ({raisedHandUsers.length})</h2>
                        <div className="flex flex-wrap gap-4">
                            {raisedHandUsers.map(u => (
                                <div key={u.id} className="bg-slate-800 p-2 rounded-lg flex items-center gap-2">
                                    <ListenerIcon user={u} onClick={() => onNavigate(AppView.PROFILE, { username: u.username })}/>
                                    <button onClick={() => handleInviteToSpeak(u.id)} className="bg-green-600 text-xs font-bold px-2 py-1 rounded">Invite to Speak</button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                 <section>
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">Listeners ({room.listeners.length})</h2>
                    <div className="flex flex-wrap gap-2">
                        {room.listeners.map(l => <ListenerIcon key={l.id} user={l} onClick={() => onNavigate(AppView.PROFILE, { username: l.username })}/>)}
                    </div>
                </section>
            </main>
            
            <div className="flex-shrink-0 h-64 border-t border-slate-700 flex flex-col">
                <div className="flex-grow overflow-y-auto p-2 space-y-2">
                    {messages.map(msg => (
                        <div key={msg.id} className="flex items-start gap-2 text-sm">
                            <img src={msg.sender.avatarUrl} className="w-6 h-6 rounded-full"/>
                            <div>
                                <span className="font-semibold text-slate-400">{msg.sender.name}: </span>
                                <span className="text-slate-200">{msg.text}</span>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-2 border-t border-slate-700">
                    <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Send a message..." className="w-full bg-slate-700 rounded-full px-4 py-2 text-sm" />
                </form>
            </div>


            <footer className="flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24 gap-6">
                {isSpeaker ? (
                    <button onClick={handleToggleMute} className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-slate-600' : 'bg-rose-600'}`}>
                        <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6" />
                    </button>
                ) : (
                    <button onClick={handleRaiseHand} className="px-4 py-2 bg-slate-600 rounded-lg font-semibold flex items-center gap-2">
                        <span>✋</span> Raise Hand
                    </button>
                )}
            </footer>
        </div>
    );
};

export default LiveRoomScreen;

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppView, LiveAudioRoom, LiveAudioRoomMessage, User } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { AGORA_APP_ID } from '../constants';

interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
  onNavigate: (view: AppView, props?: any) => void;
  onSetTtsMessage: (message: string) => void;
}

const EMOJI_REACTIONS = ['❤️', '😂', '👍', '😢', '😡', '🔥', '🎉', '🙏'];

const ParticipantActionModal: React.FC<{
    targetUser: User;
    room: LiveAudioRoom;
    currentUser: User;
    onClose: () => void;
}> = ({ targetUser, room, currentUser, onClose }) => {
    const isHost = room.host.id === currentUser.id;
    const isCoHost = room.coHosts?.some(c => c.id === currentUser.id);
    const isAdmin = isHost || isCoHost;

    if (!isAdmin || targetUser.id === currentUser.id) return null;

    const isTargetSpeaker = room.speakers.some(s => s.id === targetUser.id);
    const isTargetCoHost = room.coHosts?.some(c => c.id === targetUser.id);
    const hasRaisedHand = room.raisedHands.includes(targetUser.id);
    const isTargetMuted = room.mutedSpeakers?.includes(targetUser.id);

    // Permission checks
    const canManageTarget = isHost || (isCoHost && !room.coHosts?.some(c => c.id === targetUser.id) && room.host.id !== targetUser.id);

    const handleInviteToSpeak = () => geminiService.inviteToSpeakInAudioRoom(currentUser.id, targetUser.id, room.id).then(onClose);
    const handleMoveToAudience = () => geminiService.moveToAudienceInAudioRoom(currentUser.id, targetUser.id, room.id).then(onClose);
    const handlePromoteCoHost = () => geminiService.promoteToCoHost(room.id, currentUser.id, targetUser.id).then(onClose);
    const handleDemoteCoHost = () => geminiService.demoteCoHost(room.id, currentUser.id, targetUser.id).then(onClose);
    const handleMute = () => geminiService.muteSpeakerInRoom(room.id, currentUser.id, targetUser.id).then(onClose);
    const handleUnmute = () => geminiService.unmuteSpeakerInRoom(room.id, currentUser.id, targetUser.id).then(onClose);
    const handleKick = () => {
        if (window.confirm(`Are you sure you want to remove ${targetUser.name} from the room?`)) {
            geminiService.kickUserFromRoom(room.id, currentUser.id, targetUser.id).then(onClose);
        }
    };


    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-4 flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <img src={targetUser.avatarUrl} alt={targetUser.name} className="w-20 h-20 rounded-full mb-3" />
                <h3 className="text-xl font-bold">{targetUser.name}</h3>
                <div className="w-full mt-4 space-y-2">
                    {canManageTarget && (
                        <>
                            {isTargetSpeaker && !isTargetCoHost && isHost && <button onClick={handlePromoteCoHost} className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 rounded-lg">Promote to Co-host</button>}
                            {isTargetCoHost && isHost && <button onClick={handleDemoteCoHost} className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-semibold py-3 rounded-lg">Remove as Co-host</button>}
                            
                            {isTargetSpeaker && isTargetMuted && <button onClick={handleUnmute} className="w-full bg-slate-500 hover:bg-slate-400 text-white font-semibold py-3 rounded-lg">Unmute Speaker</button>}
                            {isTargetSpeaker && !isTargetMuted && <button onClick={handleMute} className="w-full bg-slate-500 hover:bg-slate-400 text-white font-semibold py-3 rounded-lg">Mute Speaker</button>}
                            
                            {isTargetSpeaker && targetUser.id !== room.host.id && <button onClick={handleMoveToAudience} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-3 rounded-lg">Move to Audience</button>}
                            {!isTargetSpeaker && <button onClick={handleInviteToSpeak} className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-lg">Invite to Speak</button>}
                            
                            <button onClick={handleKick} className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-lg">Kick from Room</button>
                        </>
                    )}
                    <button onClick={onClose} className="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-3 rounded-lg mt-2">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const SpeakerCard: React.FC<{ user: User; isHost: boolean; isCoHost: boolean; isMuted: boolean; isSpeaking: boolean; onClick: () => void }> = ({ user, isHost, isCoHost, isMuted, isSpeaking, onClick }) => (
    <div className="flex flex-col items-center gap-2 text-center w-24 md:w-28">
        <button onClick={onClick} className="relative group">
            <img src={user.avatarUrl} alt={user.name} className={`w-20 h-20 md:w-24 md:h-24 rounded-full transition-all duration-200 object-cover ${isSpeaking ? 'ring-4 ring-green-400 animate-pulse' : 'ring-2 ring-fuchsia-500/50'}`} />
            {(isHost || isCoHost) && <div className="absolute -bottom-1 -right-1 bg-amber-400 text-black text-sm p-1 rounded-full shadow-lg">{isHost ? '👑' : '⭐'}</div>}
            {isMuted && <div className="absolute top-0 right-0 bg-black/60 p-1.5 rounded-full"><Icon name="microphone-slash" className="w-4 h-4 text-white"/></div>}
        </button>
        <p className="font-semibold text-sm truncate w-full text-slate-100">{user.name}</p>
    </div>
);

const ListenerCard: React.FC<{ user: User; isAdminView: boolean; hasRaisedHand: boolean; onClick: () => void }> = ({ user, isAdminView, hasRaisedHand, onClick }) => (
     <button onClick={onClick} className="flex flex-col items-center gap-1 w-20 text-center relative group">
        <img src={user.avatarUrl} alt={user.name} title={user.name} className="w-14 h-14 rounded-full ring-2 ring-slate-700 transition-transform group-hover:scale-105 object-cover" />
        {isAdminView && hasRaisedHand && (
            <div className="absolute -top-1 -right-1 bg-sky-500 p-1.5 rounded-full animate-pulse shadow-lg text-lg">✋</div>
        )}
        <p className="font-medium text-xs truncate w-full text-slate-300">{user.name}</p>
    </button>
);

const Message: React.FC<{ message: LiveAudioRoomMessage }> = ({ message }) => (
    <div className="flex items-start gap-2 text-sm max-w-full animate-fade-in-fast">
        <img src={message.sender.avatarUrl} className="w-8 h-8 rounded-full flex-shrink-0 mt-1 object-cover" alt={message.sender.name} />
        <div className="flex-shrink min-w-0 bg-slate-800/50 px-3 py-2 rounded-lg">
            <div className="flex items-baseline gap-2">
                <span className={`font-semibold ${message.isHost ? 'text-amber-400' : message.isCoHost ? 'text-sky-400' : 'text-fuchsia-400'}`}>{message.sender.name}</span>
                 <span className="text-xs text-slate-500">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p className="text-slate-200 break-words whitespace-pre-wrap">{message.text}</p>
        </div>
    </div>
);

const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onGoBack, onNavigate, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [messages, setMessages] = useState<LiveAudioRoomMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [selectedParticipant, setSelectedParticipant] = useState<User | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
    const [handRaisedOptimistic, setHandRaisedOptimistic] = useState(false);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    
    const isHost = room?.host.id === currentUser.id;
    const isCoHost = room?.coHosts?.some(c => c.id === currentUser.id);
    const isAdmin = isHost || isCoHost;
    const isSpeaker = room?.speakers.some(s => s.id === currentUser.id);
    const hasRaisedHand = useMemo(() => room?.raisedHands.includes(currentUser.id) || handRaisedOptimistic, [room, currentUser.id, handRaisedOptimistic]);
    
    useEffect(() => {
        if (room && !room.raisedHands.includes(currentUser.id)) {
            setHandRaisedOptimistic(false);
        }
    }, [room, currentUser.id]);

    useEffect(() => {
        setIsLoading(true);
        geminiService.joinLiveAudioRoom(currentUser.id, roomId);
        
        const unsubRoom = geminiService.listenToAudioRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                 if(roomDetails.kickedUserIds?.includes(currentUser.id)) {
                    onSetTtsMessage("You have been removed from this room.");
                    onGoBack();
                    return;
                }
                setRoom(roomDetails);
            } else {
                onSetTtsMessage("The room has ended.");
                onGoBack();
            }
            setIsLoading(false);
        });

        const unsubMessages = geminiService.listenToLiveAudioRoomMessages(roomId, setMessages);

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8', agoraProxy: true });
        agoraClient.current = client;

        client.on('user-published', async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio') {
                user.audioTrack?.play();
            }
        });

        client.on('volume-indicator', (volumes) => {
            if (volumes.length === 0) {
                setActiveSpeakerId(null);
                return;
            }
            const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max, { level: 0 });
            if (mainSpeaker.level > 10) {
                setActiveSpeakerId(mainSpeaker.uid as string);
            }
            else setActiveSpeakerId(null);
        });

        const joinAgora = async () => {
             const token = await geminiService.getAgoraToken(roomId, currentUser.id);
             if (!token) {
                 onSetTtsMessage("Could not get audio token. Please try again.");
                 onGoBack();
                 return;
             }
             await client.join(AGORA_APP_ID, roomId, token, currentUser.id);
             client.enableAudioVolumeIndicator();
        };

        joinAgora().catch(err => {
            console.error("Agora Join Error:", err);
            if (err.code === 'UID_CONFLICT') {
                onSetTtsMessage("Error: You might already be in this room in another tab. Please close it and try again.");
            } else {
                onSetTtsMessage("Could not connect to the audio room.");
            }
            onGoBack();
        });
        
        return () => {
            unsubRoom();
            unsubMessages();
            geminiService.leaveLiveAudioRoom(currentUser.id, roomId);
            localAudioTrack.current?.stop();
            localAudioTrack.current?.close();
            agoraClient.current?.leave();
        };
    }, [roomId, onGoBack, currentUser.id, onSetTtsMessage]);
    
    useEffect(() => {
        const publishAudio = async () => {
            if(isSpeaker && !localAudioTrack.current) {
                try {
                    localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
                    await agoraClient.current?.publish(localAudioTrack.current);
                    localAudioTrack.current.setMuted(isMuted);
                } catch (e) {
                    console.error("Failed to get microphone for publishing", e);
                    onSetTtsMessage("Could not access your microphone. You can listen but not speak.");
                }
            } else if (!isSpeaker && localAudioTrack.current) {
                await agoraClient.current?.unpublish(localAudioTrack.current);
                localAudioTrack.current.stop();
                localAudioTrack.current.close();
                localAudioTrack.current = null;
            }
        };
        publishAudio();
    }, [isSpeaker, isMuted, onSetTtsMessage]);

    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setEmojiPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !room) return;
        await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, newMessage, isHost, isSpeaker, isCoHost);
        setNewMessage('');
    };
    
    const handleRaiseHand = async () => {
        if (hasRaisedHand) return;
        setHandRaisedOptimistic(true);
        await geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
    };

    const toggleMute = async () => {
        if (localAudioTrack.current) {
            await localAudioTrack.current.setMuted(!isMuted);
            setIsMuted(!isMuted);
        }
    };
    
    const floatEmoji = (emoji: string) => {
        const newEmoji = {
            id: Date.now() + Math.random(),
            emoji,
            x: Math.random() * 80 + 10,
        };
        setFloatingEmojis(prev => [...prev, newEmoji]);
        setTimeout(() => {
            setFloatingEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
        }, 3000);
    };

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }
    
    return (
      <div className="h-full w-full flex flex-col bg-gradient-to-b from-slate-900 via-indigo-900/50 to-slate-900 text-white">
        {selectedParticipant && <ParticipantActionModal targetUser={selectedParticipant} room={room} currentUser={currentUser} onClose={() => setSelectedParticipant(null)} />}
        <header className="flex-shrink-0 p-4 flex justify-between items-center">
            <div>
                <h1 className="text-xl font-bold truncate">{room.topic}</h1>
                <p className="text-sm text-slate-400">Hosted by {room.host.name}</p>
            </div>
            <button onClick={() => onNavigate(AppView.ROOM_PARTICIPANTS, { roomId })} className="flex items-center gap-1 text-sm bg-slate-700/50 px-3 py-1.5 rounded-full">
                <Icon name="users" className="w-4 h-4"/>
                {room.speakers.length + room.listeners.length}
            </button>
            <button onClick={onGoBack} className="bg-red-600 hover:bg-red-500 font-bold py-2 px-4 rounded-lg">
                Leave
            </button>
        </header>

        <main className="flex-grow flex flex-col md:flex-row overflow-hidden">
            <div className="md:w-3/5 p-4 flex flex-col">
                <section className="bg-slate-800/50 rounded-xl p-4 flex-grow relative overflow-hidden">
                     {floatingEmojis.map(e => (
                        <div key={e.id} className="floating-emoji text-4xl" style={{ left: `${e.x}%` }}>{e.emoji}</div>
                    ))}
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">Speakers ({room.speakers.length})</h2>
                    <div className="flex flex-wrap gap-4 md:gap-6 justify-center">
                        {room.speakers.map(s => (
                            <SpeakerCard
                                key={s.id}
                                user={s}
                                isHost={s.id === room.host.id}
                                isCoHost={room.coHosts?.some(c => c.id === s.id)}
                                isMuted={room.mutedSpeakers?.includes(s.id) || (s.id === currentUser.id && isMuted)}
                                isSpeaking={s.id === activeSpeakerId}
                                onClick={() => setSelectedParticipant(s)}
                            />
                        ))}
                    </div>
                </section>
                 <section className="mt-4 bg-slate-800/50 rounded-xl p-4 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">Listeners ({room.listeners.length})</h2>
                     <div className="flex flex-wrap gap-3">
                         {room.listeners.slice(0, 18).map(l => (
                            <ListenerCard 
                                key={l.id} 
                                user={l}
                                isAdminView={isAdmin}
                                hasRaisedHand={room.raisedHands.includes(l.id)}
                                onClick={() => setSelectedParticipant(l)}
                            />
                         ))}
                     </div>
                </section>
            </div>
            <div className="md:w-2/5 p-4 pt-0 md:pt-4 flex flex-col h-1/2 md:h-full">
                <div ref={messagesContainerRef} className="flex-grow bg-slate-800/50 rounded-xl p-4 space-y-3 overflow-y-auto">
                    {messages.map(msg => <Message key={msg.id} message={msg} />)}
                    <div ref={messagesEndRef} />
                </div>
            </div>
        </main>

        <footer className="flex-shrink-0 p-4 bg-black/20 flex items-center justify-between gap-4">
             <div className="relative" ref={emojiPickerRef}>
                {isEmojiPickerOpen && (
                    <div className="absolute bottom-full mb-2 bg-slate-800 border border-slate-600 rounded-2xl p-2 grid grid-cols-4 gap-1">
                        {EMOJI_REACTIONS.map(emoji => (
                            <button key={emoji} onClick={() => floatEmoji(emoji)} className="text-3xl p-2 rounded-lg hover:bg-slate-700">{emoji}</button>
                        ))}
                    </div>
                )}
                <button onClick={() => setEmojiPickerOpen(p => !p)} className="p-3 bg-slate-700 rounded-full hover:bg-slate-600">
                    <Icon name="face-smile" className="w-6 h-6"/>
                </button>
            </div>
             <form onSubmit={handleSendMessage} className="flex-grow flex items-center gap-2">
                <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Say something..." className="w-full bg-slate-700 rounded-full py-3 px-4 focus:outline-none focus:ring-2 focus:ring-rose-500"/>
                <button type="submit" className="p-3 bg-rose-600 rounded-full hover:bg-rose-500"><Icon name="paper-airplane" className="w-6 h-6"/></button>
            </form>
            <div className="flex items-center gap-3">
                {isSpeaker ? (
                    <button onClick={toggleMute} className={`p-3 rounded-full ${isMuted ? 'bg-red-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                        <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6"/>
                    </button>
                ) : (
                    <button onClick={handleRaiseHand} disabled={hasRaisedHand} className="p-3 bg-slate-700 rounded-full hover:bg-slate-600 disabled:opacity-50">
                       <span className="text-2xl">{hasRaisedHand ? '✋' : '✋'}</span>
                    </button>
                )}
            </div>
        </footer>
      </div>
    );
};

export default LiveRoomScreen;
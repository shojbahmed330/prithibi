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

// Consistent numeric UID generation
const stringToNumericUid = (uid: string): number => {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
        const char = uid.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash); // Agora UIDs must be positive 32-bit integers.
};


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
    const [uidMap, setUidMap] = useState(new Map<number, string>());

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const numericUidRef = useRef<number | null>(null);

    const isHost = room?.host.id === currentUser.id;
    const isCoHost = room?.coHosts?.some(c => c.id === currentUser.id);
    const isAdmin = isHost || isCoHost;
    const isSpeaker = room?.speakers.some(s => s.id === currentUser.id);
    const hasRaisedHand = room?.raisedHands.includes(currentUser.id);

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

                const newMap = new Map<number, string>();
                [...roomDetails.speakers, ...roomDetails.listeners, roomDetails.host].forEach(p => {
                    if (p) newMap.set(stringToNumericUid(p.id), p.id);
                });
                setUidMap(newMap);

            } else {
                onSetTtsMessage("The room has ended.");
                onGoBack();
            }
            setIsLoading(false);
        });

        const unsubMessages = geminiService.listenToLiveAudioRoomMessages(roomId, setMessages);

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.current = client;

        client.on('user-published', async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio') {
                user.audioTrack?.play();
            }
        });

        client.on('volume-indicator', (volumes) => {
            const mainSpeaker = volumes.reduce((max, current) => current.level > max.level ? current : max, { level: 0 });
            if (mainSpeaker.level > 10) {
                const speakerNumericUid = mainSpeaker.uid as number;
                const speakerFirebaseUid = uidMap.get(speakerNumericUid);
                setActiveSpeakerId(speakerFirebaseUid || null);
            }
            else setActiveSpeakerId(null);
        });

        const joinAgora = async () => {
             const numericUid = stringToNumericUid(currentUser.id);
             numericUidRef.current = numericUid;

             const token = await geminiService.getAgoraToken(roomId, numericUid);
             if (!token) {
                 onSetTtsMessage("Could not get audio token. Please try again.");
                 onGoBack();
                 return;
             }
             await client.join(AGORA_APP_ID, roomId, token, numericUid);
             client.enableAudioVolumeIndicator();
        };

        joinAgora();
        
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
                    console.error("Failed to create or publish audio track", e);
                    onSetTtsMessage("Could not access microphone.");
                }
            } else if (!isSpeaker && localAudioTrack.current) {
                await agoraClient.current?.unpublish(localAudioTrack.current);
                localAudioTrack.current.stop();
                localAudioTrack.current.close();
                localAudioTrack.current = null;
            }
        }
        publishAudio();
    }, [isSpeaker, isMuted, onSetTtsMessage]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) setEmojiPickerOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLeave = () => {
        if (isHost) {
            if (window.confirm("As the host, leaving will end the room for everyone. Are you sure?")) {
                geminiService.endLiveAudioRoom(currentUser.id, roomId);
            }
        } else {
            onGoBack();
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !room) return;
        await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, newMessage, !!isHost, !!isSpeaker, !!isCoHost);
        setNewMessage('');
    };
    
    const handleRaiseHand = () => {
        if (hasRaisedHand) return;
        geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
        onSetTtsMessage("You've raised your hand to speak.");
    }
    
    const handleMuteAll = () => {
        geminiService.muteAllSpeakersInRoom(roomId, currentUser.id);
    }

    const toggleMute = () => {
        const newMutedState = !isMuted;
        localAudioTrack.current?.setMuted(newMutedState);
        setIsMuted(newMutedState);
    }

    const triggerFloatingEmoji = (emoji: string) => {
        const newEmoji = { id: Date.now() + Math.random(), emoji, x: Math.random() * 80 + 10 };
        setFloatingEmojis(current => [...current, newEmoji]);
        setTimeout(() => {
            setFloatingEmojis(current => current.filter(e => e.id !== newEmoji.id));
        }, 3000); // Animation duration
        setEmojiPickerOpen(false);
    };
    
    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }

    return (
        <div className="h-full w-full flex flex-col bg-gradient-to-b from-slate-900 to-black text-white">
            <header className="flex-shrink-0 p-3 flex justify-between items-center bg-black/30 md:border-b md:border-slate-700">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={onGoBack} className="p-2 rounded-full text-slate-300 hover:bg-slate-700 md:hidden">
                        <Icon name="back" className="w-6 h-6"/>
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold truncate">{room.topic}</h1>
                        <p className="text-sm text-slate-400">
                           {room.speakers.length + room.listeners.length} participant(s)
                        </p>
                    </div>
                </div>
                <button onClick={handleLeave} className="bg-red-600 hover:bg-red-500 font-bold py-2 px-4 rounded-lg">
                    {isHost ? 'End Room' : 'Leave'}
                </button>
            </header>
            
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
                {/* Main content for both mobile and desktop */}
                <main className="flex-grow md:w-2/3 p-4 space-y-6 overflow-y-auto md:border-r md:border-slate-700 relative">
                    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                        {floatingEmojis.map(({ id, emoji, x }) => (
                            <span key={id} className="floating-reaction absolute bottom-0 text-4xl" style={{ left: `${x}%` }}>
                                {emoji}
                            </span>
                        ))}
                    </div>
                    <section>
                        <h2 className="text-lg font-semibold text-slate-300 mb-4 px-2">Speakers ({room.speakers.length})</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {room.speakers.map(s => <SpeakerCard key={s.id} user={s} isHost={s.id === room.host.id} isCoHost={room.coHosts?.some(c=>c.id === s.id) || false} isMuted={room.mutedSpeakers?.includes(s.id) || (s.id === currentUser.id && isMuted)} isSpeaking={s.id === activeSpeakerId} onClick={() => setSelectedParticipant(s)} />)}
                        </div>
                    </section>
                    <section>
                        <h2 className="text-lg font-semibold text-slate-300 mb-4 px-2">Listeners ({room.listeners.length})</h2>
                        <div className="flex flex-wrap gap-4">
                            {room.listeners.map(l => <ListenerCard key={l.id} user={l} isAdminView={isAdmin || false} hasRaisedHand={room.raisedHands.includes(l.id)} onClick={() => setSelectedParticipant(l)}/>)}
                        </div>
                    </section>
                </main>

                {/* Chat area */}
                <aside className="w-full md:w-1/3 flex flex-col bg-slate-800/50 flex-shrink-0 h-56 md:h-auto border-t md:border-t-0 md:border-l border-slate-700">
                     <h2 className="text-lg font-semibold text-slate-300 p-4 border-b border-slate-700 flex-shrink-0">Live Chat</h2>
                     <div className="flex-grow overflow-y-auto p-4 space-y-4 no-scrollbar">
                        {messages.map(msg => <Message key={msg.id} message={msg} />)}
                        <div ref={messagesEndRef} />
                     </div>
                </aside>
            </div>
            
            {/* --- New Mobile & Desktop Footer --- */}
            <footer className="flex-shrink-0 p-2 bg-black/50 border-t border-slate-700">
                {/* Desktop Buttons */}
                <div className="hidden md:flex items-center gap-2">
                     {isSpeaker && (
                        <button onClick={toggleMute} className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-slate-600 hover:bg-slate-500'}`}>
                            <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-5 h-5" />
                        </button>
                    )}
                     {!isSpeaker && (
                        <button onClick={handleRaiseHand} disabled={hasRaisedHand} className={`py-2 px-4 rounded-lg text-lg transition-colors flex items-center gap-2 ${hasRaisedHand ? 'bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'}`}>
                           ✋ <span className="text-sm font-semibold">Raise Hand</span>
                        </button>
                    )}
                     {isAdmin && (
                         <button onClick={handleMuteAll} className="py-2 px-4 rounded-lg bg-slate-600 hover:bg-slate-500 flex items-center gap-2" title="Mute All Speakers">
                            <Icon name="microphone-slash" className="w-5 h-5" /> <span className="text-sm font-semibold">Mute All</span>
                        </button>
                    )}
                    <form onSubmit={handleSendMessage} className="flex-grow flex items-center gap-2 relative">
                         <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Send a message..." className="w-full bg-slate-700 rounded-full py-2 pl-4 pr-12 text-sm focus:ring-fuchsia-500 focus:border-fuchsia-500"/>
                         <button type="submit" disabled={!newMessage.trim()} className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-fuchsia-600 text-black hover:bg-fuchsia-500 disabled:bg-slate-500 h-8 w-8 flex items-center justify-center"><Icon name="paper-airplane" className="w-4 h-4"/></button>
                    </form>
                    <div className="relative" ref={emojiPickerRef}>
                        <button type="button" onClick={() => setEmojiPickerOpen(p => !p)} className="p-3 rounded-full text-slate-300 hover:bg-slate-600">
                            <Icon name="face-smile" className="w-5 h-5"/>
                        </button>
                         {isEmojiPickerOpen && (
                            <div className="absolute bottom-full right-0 mb-2 bg-slate-900/90 backdrop-blur-sm border border-fuchsia-500/20 rounded-lg p-2 grid grid-cols-4 gap-1 shadow-lg w-48">
                                {EMOJI_REACTIONS.map(emoji => (
                                    <button key={emoji} type="button" onClick={() => triggerFloatingEmoji(emoji)} className="text-2xl p-1 rounded-md hover:bg-slate-700 aspect-square flex items-center justify-center">{emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile Buttons */}
                <div className="md:hidden flex items-center gap-2">
                    {!isSpeaker && (
                        <button onClick={handleRaiseHand} disabled={hasRaisedHand} className={`p-3 rounded-full text-2xl transition-colors ${hasRaisedHand ? 'bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'}`}>
                            ✋
                        </button>
                    )}
                    {isSpeaker && (
                         <button onClick={toggleMute} className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-600' : 'bg-slate-600 hover:bg-slate-500'}`}>
                            <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-5 h-5" />
                        </button>
                    )}
                    <form onSubmit={handleSendMessage} className="flex-grow flex items-center relative">
                         <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Send a message..." className="w-full bg-slate-700 rounded-full py-2 pl-4 pr-10 text-sm focus:ring-fuchsia-500 focus:border-fuchsia-500"/>
                         <button type="submit" disabled={!newMessage.trim()} className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-fuchsia-600 text-black hover:bg-fuchsia-500 disabled:bg-slate-500 h-8 w-8 flex items-center justify-center"><Icon name="paper-airplane" className="w-4 h-4"/></button>
                    </form>
                     <div className="relative" ref={emojiPickerRef}>
                        <button type="button" onClick={() => setEmojiPickerOpen(p => !p)} className="p-3 rounded-full text-slate-300 hover:bg-slate-600">
                            <Icon name="face-smile" className="w-5 h-5"/>
                        </button>
                         {isEmojiPickerOpen && (
                            <div className="absolute bottom-full right-0 mb-2 bg-slate-900/90 backdrop-blur-sm border border-fuchsia-500/20 rounded-lg p-2 grid grid-cols-4 gap-1 shadow-lg w-48">
                                {EMOJI_REACTIONS.map(emoji => (
                                    <button key={emoji} type="button" onClick={() => triggerFloatingEmoji(emoji)} className="text-2xl p-1 rounded-md hover:bg-slate-700 aspect-square flex items-center justify-center">{emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </footer>
             {selectedParticipant && <ParticipantActionModal targetUser={selectedParticipant} room={room} currentUser={currentUser} onClose={() => setSelectedParticipant(null)} />}
        </div>
    );
};

export default LiveRoomScreen;
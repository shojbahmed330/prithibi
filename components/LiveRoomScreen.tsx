import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, LiveAudioRoom, LiveAudioRoomMessage, User } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';

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
    if (!isHost || targetUser.id === currentUser.id) return null; // Only host can see this, and not for themselves

    const isTargetSpeaker = room.speakers.some(s => s.id === targetUser.id);
    const hasRaisedHand = room.raisedHands.includes(targetUser.id);

    const handleInviteToSpeak = () => {
        geminiService.inviteToSpeakInAudioRoom(currentUser.id, targetUser.id, room.id);
        onClose();
    };

    const handleMoveToAudience = () => {
        geminiService.moveToAudienceInAudioRoom(currentUser.id, targetUser.id, room.id);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-4 flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <img src={targetUser.avatarUrl} alt={targetUser.name} className="w-20 h-20 rounded-full mb-3" />
                <h3 className="text-xl font-bold">{targetUser.name}</h3>
                <div className="w-full mt-4 space-y-2">
                    {hasRaisedHand && !isTargetSpeaker && (
                         <button onClick={handleInviteToSpeak} className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-lg">Invite to Speak</button>
                    )}
                    {isTargetSpeaker && targetUser.id !== room.host.id && (
                         <button onClick={handleMoveToAudience} className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-semibold py-3 rounded-lg">Move to Audience</button>
                    )}
                    <button onClick={onClose} className="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-3 rounded-lg mt-2">Cancel</button>
                </div>
            </div>
        </div>
    );
};


const SpeakerCard: React.FC<{ user: User; isHost: boolean; onClick: () => void }> = ({ user, isHost, onClick }) => (
    <button onClick={onClick} className="flex flex-col items-center gap-2 w-24 text-center">
        <div className="relative">
            <img src={user.avatarUrl} alt={user.name} className="w-20 h-20 rounded-full ring-2 ring-lime-500/50" />
            {isHost && <div className="absolute -bottom-1 -right-1 bg-amber-400 text-black text-xs p-1 rounded-full shadow-lg">👑</div>}
        </div>
        <p className="font-semibold text-sm truncate w-full text-slate-100">{user.name}</p>
    </button>
);

const ListenerCard: React.FC<{ user: User; isHostView: boolean; hasRaisedHand: boolean; onClick: () => void }> = ({ user, isHostView, hasRaisedHand, onClick }) => (
     <button onClick={onClick} className="flex flex-col items-center gap-1 w-20 text-center relative">
        <img src={user.avatarUrl} alt={user.name} title={user.name} className="w-12 h-12 rounded-full ring-2 ring-slate-700" />
        {isHostView && hasRaisedHand && (
            <div className="absolute top-0 right-0 bg-blue-500 p-1 rounded-full animate-pulse">✋</div>
        )}
        <p className="font-medium text-xs truncate w-full text-slate-300">{user.name}</p>
    </button>
);

const Message: React.FC<{ message: LiveAudioRoomMessage }> = ({ message }) => (
    <div className="flex items-start gap-2 text-sm max-w-full">
        <img src={message.sender.avatarUrl} className="w-8 h-8 rounded-full flex-shrink-0 mt-1" alt={message.sender.name} />
        <div className="flex-shrink min-w-0 bg-slate-800/50 px-3 py-2 rounded-lg">
            <div className="flex items-baseline gap-2">
                <span className="font-semibold text-lime-400">{message.sender.name}</span>
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
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    const isHost = room?.host.id === currentUser.id;
    const isSpeaker = room?.speakers.some(s => s.id === currentUser.id);
    const isListener = !isSpeaker;
    const hasRaisedHand = room?.raisedHands.includes(currentUser.id);

    useEffect(() => {
        setIsLoading(true);
        const unsubRoom = geminiService.listenToAudioRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                setRoom(roomDetails);
            } else {
                onSetTtsMessage("The room has ended.");
                onGoBack();
            }
            setIsLoading(false);
        });

        const unsubMessages = geminiService.listenToLiveAudioRoomMessages(roomId, (newMessages) => {
            setMessages(newMessages);
        });

        return () => {
            unsubRoom();
            unsubMessages();
            geminiService.leaveLiveAudioRoom(currentUser.id, roomId);
        };
    }, [roomId, onGoBack, currentUser.id, onSetTtsMessage]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, newMessage, isHost, !!isSpeaker);
        setNewMessage('');
        setEmojiPickerOpen(false);
    };
    
    const handleRaiseHand = () => {
        if (hasRaisedHand) return;
        geminiService.raiseHandInAudioRoom(currentUser.id, roomId);
        onSetTtsMessage("You've raised your hand to speak.");
    }
    
    const handleAddEmoji = (emoji: string) => {
        setNewMessage(prev => prev + emoji);
    }
    
    const handleParticipantClick = (user: User) => {
        if (isHost) {
            setSelectedParticipant(user);
        } else {
            onNavigate(AppView.PROFILE, { username: user.username });
        }
    }


    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }

    return (
        <div className="h-full w-full flex flex-col bg-slate-900 text-white">
            <header className="flex-shrink-0 p-3 flex justify-between items-center bg-black/30 border-b border-slate-700">
                <div className="flex items-center gap-3">
                    <button onClick={onGoBack} className="p-2 rounded-full text-slate-300 hover:bg-slate-700">
                        <Icon name="back" className="w-6 h-6"/>
                    </button>
                    <div>
                        <h1 className="text-xl font-bold truncate">{room.topic}</h1>
                        <p className="text-sm text-slate-400">
                           {room.speakers.length + room.listeners.length} participant(s)
                        </p>
                    </div>
                </div>
                <button onClick={handleLeave} className="bg-red-600 hover:bg-red-500 font-bold py-2 px-4 rounded-lg">
                    Leave
                </button>
            </header>

            <main className="flex-grow overflow-y-auto p-4 space-y-6">
                <section>
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">Speakers ({room.speakers.length})</h2>
                    <div className="flex flex-wrap gap-4">
                        {room.speakers.map(s => <SpeakerCard key={s.id} user={s} isHost={s.id === room.host.id} onClick={() => handleParticipantClick(s)} />)}
                    </div>
                </section>
                <section>
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">Listeners ({room.listeners.length})</h2>
                    <div className="flex flex-wrap gap-4">
                        {room.listeners.map(l => <ListenerCard key={l.id} user={l} isHostView={isHost} hasRaisedHand={room.raisedHands.includes(l.id)} onClick={() => handleParticipantClick(l)}/>)}
                    </div>
                </section>
                <section className="border-t border-slate-700 pt-4">
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">Live Chat</h2>
                    <div className="space-y-4">
                       {messages.map(msg => <Message key={msg.id} message={msg} />)}
                       <div ref={messagesEndRef} />
                    </div>
               </section>
            </main>

            <footer className="flex-shrink-0 p-2 bg-black/30 border-t border-slate-700">
                <div className="relative">
                    {isEmojiPickerOpen && (
                        <div ref={emojiPickerRef} className="absolute bottom-full mb-2 w-full max-w-sm left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-lg p-2 grid grid-cols-6 gap-2">
                            {EMOJI_REACTIONS.map(emoji => (
                                <button key={emoji} onClick={() => handleAddEmoji(emoji)} className="text-2xl p-1 rounded-md hover:bg-slate-700 aspect-square flex items-center justify-center">{emoji}</button>
                            ))}
                        </div>
                    )}
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                        {isListener && (
                             <button type="button" onClick={handleRaiseHand} disabled={hasRaisedHand} className={`p-3 rounded-full transition-colors ${hasRaisedHand ? 'bg-blue-500' : 'bg-slate-600 hover:bg-slate-500'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11" /></svg>
                             </button>
                        )}
                        <div className="relative flex-grow">
                            <input 
                                type="text" 
                                value={newMessage} 
                                onChange={e => setNewMessage(e.target.value)} 
                                placeholder="Send a message..."
                                className="w-full bg-slate-700 rounded-full py-2.5 pl-4 pr-12 text-sm focus:ring-lime-500 focus:border-lime-500"
                            />
                             <button type="button" onClick={() => setEmojiPickerOpen(p => !p)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white">
                                <Icon name="face-smile" className="w-5 h-5" />
                            </button>
                        </div>
                        <button type="submit" disabled={!newMessage.trim()} className="p-3 rounded-full bg-lime-600 text-black hover:bg-lime-500 disabled:bg-slate-500">
                            <Icon name="paper-airplane" className="w-5 h-5"/>
                        </button>
                    </form>
                </div>
            </footer>
             {selectedParticipant && <ParticipantActionModal targetUser={selectedParticipant} room={room} currentUser={currentUser} onClose={() => setSelectedParticipant(null)} />}
        </div>
    );
};

export default LiveRoomScreen;
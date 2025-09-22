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

const SpeakerIcon: React.FC<{ user: User; isHost: boolean; onClick: () => void }> = ({ user, isHost, onClick }) => (
    <button onClick={onClick} className="flex flex-col items-center gap-2 w-24 text-center">
        <div className="relative">
            <img src={user.avatarUrl} alt={user.name} className="w-20 h-20 rounded-full ring-2 ring-slate-600" />
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


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onGoBack, onNavigate }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [messages, setMessages] = useState<LiveAudioRoomMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const isHost = room?.host.id === currentUser.id;

    // Fetch room and message data
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

    // **AUTO-SCROLL IMPLEMENTATION**
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
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

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !room) return;
        const currentUserIsSpeaker = room.speakers.some(s => s.id === currentUser.id);
        const currentUserIsHost = room.host.id === currentUser.id;
        await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, newMessage, currentUserIsHost, currentUserIsSpeaker);
        setNewMessage('');
    };

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Room...</div>;
    }

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
                        {room.speakers.map(s => <SpeakerIcon key={s.id} user={s} isHost={s.id === room.host.id} onClick={() => onNavigate(AppView.PROFILE, { username: s.username })} />)}
                    </div>
                </section>
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
                        <div key={msg.id} className="flex items-start gap-2 text-sm max-w-full">
                            <img src={msg.sender.avatarUrl} className="w-6 h-6 rounded-full flex-shrink-0"/>
                            <div className="flex-shrink min-w-0">
                                <span className="font-semibold text-slate-400 mr-1">{msg.sender.name}:</span>
                                <span className="text-slate-200 break-words">{msg.text}</span>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-2 border-t border-slate-700">
                    <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Send a message..." className="w-full bg-slate-700 rounded-full px-4 py-2 text-sm focus:ring-lime-500 focus:border-lime-500" />
                </form>
            </div>


            <footer className="flex-shrink-0 p-4 bg-black/20 flex justify-center items-center h-24 gap-6">
                 {/* Placeholder for mute/raise hand controls */}
            </footer>
        </div>
    );
};

export default LiveRoomScreen;
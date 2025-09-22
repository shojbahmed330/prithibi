import React, { useState, useEffect } from 'react';
import { LiveAudioRoom, User } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';

interface RoomParticipantsScreenProps {
  currentUser: User;
  roomId: string;
  onGoBack: () => void;
  onOpenProfile: (username: string) => void;
}

const ParticipantRow: React.FC<{ user: User, role?: string, onClick: () => void }> = ({ user, role, onClick }) => (
    <button onClick={onClick} className="w-full flex items-center gap-4 p-3 hover:bg-slate-700/50 rounded-lg text-left">
        <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full" />
        <div className="flex-grow">
            <p className="font-semibold text-slate-100">{user.name}</p>
            {role && <span className="text-xs font-bold text-amber-400">{role}</span>}
        </div>
    </button>
);


const RoomParticipantsScreen: React.FC<RoomParticipantsScreenProps> = ({ currentUser, roomId, onGoBack, onOpenProfile }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        const unsubscribe = geminiService.listenToAudioRoom(roomId, (roomDetails) => {
            if (roomDetails) {
                setRoom(roomDetails);
            } else {
                onGoBack(); // Room has ended
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [roomId, onGoBack]);

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">Loading Participants...</div>;
    }

    return (
        <div className="h-full w-full flex flex-col bg-slate-900 text-white">
            <header className="flex-shrink-0 p-4 flex items-center gap-3 bg-black/20 border-b border-slate-700">
                <button onClick={onGoBack} className="p-2 -ml-2 rounded-full text-slate-300 hover:bg-slate-700">
                    <Icon name="back" className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-xl font-bold truncate">Participants</h1>
                    <p className="text-sm text-slate-400">{room.topic}</p>
                </div>
            </header>

            <main className="flex-grow overflow-y-auto p-4 space-y-6">
                <section>
                    <h2 className="text-lg font-semibold text-slate-300 px-3 mb-2">Speakers ({room.speakers.length})</h2>
                    <div className="space-y-1">
                        {room.speakers.map(speaker => (
                            <ParticipantRow 
                                key={speaker.id} 
                                user={speaker} 
                                role={speaker.id === room.host.id ? 'Host 👑' : undefined}
                                onClick={() => onOpenProfile(speaker.username)}
                            />
                        ))}
                    </div>
                </section>
                
                 <section>
                    <h2 className="text-lg font-semibold text-slate-300 px-3 mb-2">Listeners ({room.listeners.length})</h2>
                    <div className="space-y-1">
                        {room.listeners.map(listener => (
                            <ParticipantRow 
                                key={listener.id} 
                                user={listener}
                                onClick={() => onOpenProfile(listener.username)}
                            />
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default RoomParticipantsScreen;

import React from 'react';
import { Icon } from '../../icons';

export function CallsView() {
    return (
        <section className="placeholder-view">
            <div className="placeholder-icon">{Icon.phone(56)}</div>
            <h2>Голосовые звонки</h2>
            <p>Зашифрованные звонки через WebRTC скоро будут доступны</p>
            <div className="placeholder-pills">
                <span className="pill">{Icon.shield(14)} End-to-end</span>
                <span className="pill">{Icon.mic(14)} Opus HD</span>
            </div>
        </section>
    );
}